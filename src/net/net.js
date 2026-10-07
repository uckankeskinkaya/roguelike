// WebRTC sessions over PeerJS (serverless gameplay; PeerJS's public broker is
// only used for the initial signaling handshake). The host is authoritative:
// clients send inputs, the host sends snapshots.
import { PEER_PREFIX, PROTOCOL, MAX_PLAYERS, HEARTBEAT_MS, TIMEOUT_MS } from '../config.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode() {
  const b = new Uint32Array(5);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

let peerLoad = null;
export function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (!peerLoad) {
    peerLoad = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/peerjs.min.js';
      s.onload = () => res();
      s.onerror = () => { peerLoad = null; rej(new Error('PeerJS yüklenemedi (internet bağlantını kontrol et)')); };
      document.head.appendChild(s);
    });
  }
  return peerLoad;
}

const PEER_OPTS = { debug: 1 };

// ICE servers: several STUN servers (direct connections through most NATs) plus
// TURN relays as a fallback for strict networks (mobile data, offices, CGNAT).
// The free public relays are often dead or blocked, so you can add your own free account
// in Ayarlar (or with  ?turn=url1,url2|user|pass ). It is stored in this browser.
const DEFAULT_ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];
let customTurn = null;
export function setTurn(str) {
  customTurn = null;
  if (!str) return;
  const [urls, username, credential] = str.split('|');
  // an invalid entry would make RTCPeerConnection throw and break all online play, so validate first
  const list = (urls || '').split(',').map((u) => u.trim()).filter((u) => /^(turns?|stuns?):[^\s]+$/i.test(u));
  const needsAuth = list.some((u) => /^turns?:/i.test(u));
  if (!list.length) return;
  if (needsAuth && !(username && username.trim() && credential && credential.trim())) return;
  customTurn = { urls: list, ...(username ? { username: username.trim(), credential: (credential || '').trim() } : {}) };
}
export function hasCustomTurn() { return !!customTurn; }
function iceConfig() {
  return { iceServers: customTurn ? [customTurn, ...DEFAULT_ICE] : DEFAULT_ICE, iceCandidatePoolSize: 2 };
}
function peerOptions() { return { ...PEER_OPTS, config: iceConfig() }; }

// Optional self-hosted PeerJS signaling server, e.g. "wss://signal.example.com:443/"
// or "127.0.0.1:9000/". Without it PeerJS's free public broker is used.
export function setSignaling(str) {
  for (const k of ['host', 'port', 'path', 'secure']) delete PEER_OPTS[k];
  if (!str) return;
  let s = str.trim();
  let secure = location.protocol === 'https:';
  const m = s.match(/^(wss?|https?):\/\//);
  if (m) { secure = m[1] === 'wss' || m[1] === 'https'; s = s.slice(m[0].length); }
  const [hp, ...rest] = s.split('/');
  const [host, port] = hp.split(':');
  if (!host) return;
  Object.assign(PEER_OPTS, { host, port: port ? +port : (secure ? 443 : 80), path: '/' + rest.join('/'), secure });
}

function parse(data) {
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return null;
}

function toArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return null;
}

// ============================================================================
export class HostSession {
  /**
   * app: {
   *   inGame(): boolean
   *   join(cid, name): pid|null   (called for joins during a running game)
   *   leave(cid, voluntary)
   *   pick(pid, index)
   *   lobbyChanged(list)
   *   log(text)
   * }
   */
  constructor(app) {
    this.app = app;
    this.peer = null;
    this.code = null;
    this.clients = new Map();   // peerId -> client record
    this.closed = false;
    this.hbTimer = null;
  }

  async open(hostName, hostCid) {
    await loadPeerJS();
    this.hostName = hostName;
    this.hostCid = hostCid;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeRoomCode();
      try {
        await this.tryOpen(code);
        this.code = code;
        this.hbTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
        return code;
      } catch (e) {
        if (e.type !== 'unavailable-id') throw e;
      }
    }
    throw new Error('Oda kodu alınamadı, tekrar dene');
  }

  tryOpen(code) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(PEER_PREFIX + code, peerOptions());
      let opened = false;
      peer.on('open', () => { opened = true; this.peer = peer; this.app.signal?.(true); resolve(); });
      peer.on('connection', (conn) => this.onConnection(conn));
      peer.on('disconnected', () => {
        // lost the signaling server only: existing players keep playing, but new
        // players cannot find the room until we are back (e.g. tab was in the background)
        this.app.signal?.(false);
        if (!this.closed && !peer.destroyed) setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 1000);
      });
      peer.on('error', (err) => {
        if (!opened) { peer.destroy(); reject(err); return; }
        this.app.log?.(`Ağ hatası: ${err.type || err.message}`);
      });
    });
  }

  lobbyList() {
    const list = [{ cid: this.hostCid, name: this.hostName, host: true }];
    for (const c of this.clients.values()) if (c.ready) list.push({ cid: c.cid, name: c.name });
    return list;
  }

  playerCount() {
    let n = 1;
    for (const c of this.clients.values()) if (c.ready) n++;
    return n;
  }

  onConnection(conn) {
    const rec = { conn, cid: null, name: '?', ready: false, pid: -1, lastHeard: performance.now(), queue: [], last: null, rtt: 0 };
    this.clients.set(conn.peer + '|' + conn.connectionId, rec);
    conn.on('data', (data) => this.onData(rec, data));
    conn.on('close', () => this.drop(rec, false));
    conn.on('error', () => this.drop(rec, false));
  }

  onData(rec, data) {
    rec.lastHeard = performance.now();
    const m = parse(data);
    if (!m) return;
    switch (m.t) {
      case 'hello': {
        if (m.v !== PROTOCOL) { this.reject(rec, 'Sürüm uyuşmuyor — sayfayı yenile'); return; }
        // same client reconnecting? drop the stale connection
        for (const [k, c] of this.clients) {
          if (c !== rec && c.cid === m.cid) { c.replaced = true; try { c.conn.close(); } catch { /* */ } this.clients.delete(k); }
        }
        const fresh = !this.app.inGame() || !this.app.hasPlayer(m.cid);
        if (fresh && this.playerCount() >= MAX_PLAYERS) { this.reject(rec, `Oda dolu (${MAX_PLAYERS} oyuncu)`); return; }
        rec.cid = String(m.cid).slice(0, 40);
        rec.name = String(m.name || 'Oyuncu').slice(0, 16);
        rec.ready = true;
        if (this.app.inGame()) {
          const pid = this.app.join(rec.cid, rec.name);
          if (pid === null) { this.reject(rec, 'Oyuna katılınamadı'); return; }
          rec.pid = pid;
          this.send(rec, { t: 'welcome', state: 'game', pid, code: this.code });
        } else {
          this.send(rec, { t: 'welcome', state: 'lobby', code: this.code });
        }
        this.app.lobbyChanged?.(this.lobbyList());
        this.broadcastLobby();
        break;
      }
      case 'in':
        if (rec.pid < 0) return;
        rec.queue.push(m);
        break;
      case 'pick':
        if (rec.pid >= 0) this.app.pick(rec.pid, m.i | 0);
        break;
      case 'ping':
        this.send(rec, { t: 'pong', c: m.c });
        if (m.rtt) rec.rtt = m.rtt;
        break;
      case 'bye':
        this.drop(rec, true);
        break;
    }
  }

  reject(rec, reason) {
    this.send(rec, { t: 'reject', reason });
    setTimeout(() => { try { rec.conn.close(); } catch { /* */ } }, 300);
    rec.ready = false;
  }

  drop(rec, voluntary) {
    const key = [...this.clients].find(([, c]) => c === rec)?.[0];
    if (!key) return;
    this.clients.delete(key);
    try { rec.conn.close(); } catch { /* */ }
    if (rec.replaced || !rec.ready) return;
    this.app.leave(rec.cid, voluntary, rec.name);
    this.app.lobbyChanged?.(this.lobbyList());
    this.broadcastLobby();
  }

  // Called when the page becomes visible again: mobile browsers suspend background tabs
  // and silently drop the signaling socket, which makes the room unreachable.
  revive() {
    const peer = this.peer;
    if (peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch { /* */ } }
  }

  heartbeat() {
    this.revive();
    const now = performance.now();
    for (const rec of [...this.clients.values()]) {
      if (now - rec.lastHeard > TIMEOUT_MS) this.drop(rec, false);
    }
  }

  send(rec, obj) {
    if (rec.conn.open) {
      try { rec.conn.send(JSON.stringify(obj)); } catch { /* */ }
    }
  }

  broadcast(obj, filter = () => true) {
    const s = JSON.stringify(obj);
    for (const rec of this.clients.values()) {
      if (rec.ready && rec.conn.open && filter(rec)) { try { rec.conn.send(s); } catch { /* */ } }
    }
  }

  broadcastLobby() {
    if (this.app.inGame()) return;
    this.broadcast({ t: 'lobby', players: this.lobbyList().map((p) => ({ name: p.name, host: !!p.host })), code: this.code });
  }

  // Start a run: assign pids (provided by the game) and notify clients.
  startGame(pidFor, seed) {
    for (const rec of this.clients.values()) {
      if (!rec.ready) continue;
      rec.pid = pidFor(rec.cid);
      rec.queue.length = 0;
      rec.last = null;
      this.send(rec, { t: 'start', pid: rec.pid, seed });
    }
  }

  backToLobby() {
    for (const rec of this.clients.values()) rec.pid = -1;
    this.broadcast({ t: 'tolobby' });
    this.broadcastLobby();
  }

  sendSnapshot(buf) {
    for (const rec of this.clients.values()) {
      if (!rec.ready || rec.pid < 0 || !rec.conn.open) continue;
      const dc = rec.conn.dataChannel;
      // congestion control: skip a snapshot instead of queueing stale state
      if (dc && dc.bufferedAmount > 256 * 1024) continue;
      try { rec.conn.send(buf); } catch { /* */ }
    }
  }

  // Next input for a remote player (one per tick, see ClientWorld.localTick).
  takeInput(pid) {
    const rec = [...this.clients.values()].find((c) => c.pid === pid && c.ready);
    if (!rec) return null;
    let m = rec.queue.shift();
    // client clock running ahead: skip the backlog but keep any dash press
    while (rec.queue.length > 6) {
      const n = rec.queue.shift();
      if (m && m.d) n.d = 1;
      m = n;
    }
    if (m) {
      rec.last = m;
      return { mx: m.mx, my: m.my, ax: m.ax, ay: m.ay, dash: !!m.d, seq: m.s };
    }
    if (rec.last) return { mx: rec.last.mx, my: rec.last.my, ax: rec.last.ax, ay: rec.last.ay, dash: false };
    return null;
  }

  stats() {
    return [...this.clients.values()].filter((c) => c.ready).map((c) => ({ name: c.name, rtt: c.rtt }));
  }

  close() {
    this.closed = true;
    clearInterval(this.hbTimer);
    this.broadcast({ t: 'bye', reason: 'Host oyunu kapattı' });
    setTimeout(() => { try { this.peer?.destroy(); } catch { /* */ } }, 200);
  }
}

// ============================================================================
export class ClientSession {
  /**
   * handlers: { message(m), snapshot(buf), status(state, info) }
   * states: connecting | lobby | game | reconnecting | closed
   */
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.closed = false;
    this.lastHeard = 0;
    this.rtt = 0;
    this.retries = 0;
    this.timer = null;
    this.state = 'connecting';
  }

  async connect(code, cid, name) {
    await loadPeerJS();
    this.code = code.toUpperCase();
    this.cid = cid;
    this.name = name;
    await new Promise((resolve, reject) => {
      const peer = new window.Peer(peerOptions());
      this.peer = peer;
      let opened = false;
      peer.on('open', () => { opened = true; resolve(); });
      peer.on('disconnected', () => {
        if (!this.closed && !peer.destroyed) setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 1000);
      });
      peer.on('error', (err) => {
        if (!opened) { reject(new Error(`Sinyal sunucusuna bağlanılamadı (${err.type || err.message || 'bilinmeyen'}). İnternetini / VPN / reklam engelleyicini kontrol et.`)); return; }
        if (err.type === 'peer-unavailable') {
          if (this.state === 'reconnecting') return; // keep trying until the budget runs out
          this.fatal = true;
          this.fail('Oda bulunamadı: kodu kontrol et (host\'un oda açık mı?)');
        }
      });
    });
    // up to 3 attempts: the first WebRTC handshake can take a while on slow networks / TURN
    let lastErr = null;
    for (let attempt = 1; attempt <= 3 && !this.closed; attempt++) {
      this.h.progress?.(attempt === 1 ? 'Odaya bağlanılıyor…' : `Odaya bağlanılıyor… (deneme ${attempt}/3)`);
      try { await this.openConn(); lastErr = null; break; } catch (e) {
        lastErr = e;
        if (this.fatal) break; // e.g. room not found: retrying is pointless
      }
    }
    if (lastErr) throw lastErr;
    this.timer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  }

  openConn() {
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'raw' });
      this.conn = conn;
      let done = false;
      this.iceState = 'başlıyor';
      // watch the WebRTC connection state once PeerJS has created it
      const watch = setInterval(() => {
        const pc = conn.peerConnection;
        if (!pc) return;
        this.iceState = pc.iceConnectionState;
        if (!pc._nkWatched) {
          pc._nkWatched = true;
          pc.addEventListener('iceconnectionstatechange', () => { this.iceState = pc.iceConnectionState; this.h.progress?.(`Odaya bağlanılıyor… (ağ: ${pc.iceConnectionState})`); });
        }
        if (pc.iceConnectionState === 'failed' && !done) { done = true; clearInterval(watch); clearTimeout(to); try { conn.close(); } catch { /* */ } reject(new Error(this.hint())); }
      }, 400);
      const to = setTimeout(() => {
        clearInterval(watch);
        if (!done) { done = true; try { conn.close(); } catch { /* */ } reject(new Error(this.hint())); }
      }, 22000);
      conn.on('open', () => {
        if (done) return;
        done = true;
        clearTimeout(to);
        clearInterval(watch);
        this.lastHeard = performance.now();
        conn.send(JSON.stringify({ t: 'hello', cid: this.cid, name: this.name, v: PROTOCOL }));
        resolve();
      });
      conn.on('data', (data) => {
        this.lastHeard = performance.now();
        const buf = toArrayBuffer(data);
        if (buf) { this.h.snapshot(buf); return; }
        if (data instanceof Blob) { data.arrayBuffer().then((b) => this.h.snapshot(b)); return; }
        const m = parse(data);
        if (!m) return;
        if (m.t === 'pong') { this.rtt = performance.now() - m.c; return; }
        if (m.t === 'reject') { this.fail(m.reason); return; }
        if (m.t === 'bye') { this.fail(m.reason || 'Host ayrıldı'); return; }
        if (m.t === 'welcome') { this.retries = 0; this.state = m.state; this.h.status(m.state, m); }
        this.h.message(m);
      });
      conn.on('close', () => { if (conn === this.conn) this.lost(); });
      conn.on('error', () => { if (conn === this.conn) this.lost(); });
    });
  }

  // Explains the most likely reasons for a connection that never opened
  hint() {
    const st = this.iceState;
    if (st === 'failed' || st === 'disconnected') {
      return 'Doğrudan bağlantı kurulamadı (ağ: ' + st + '). İkinizden biri kısıtlı bir ağda olabilir (mobil veri, okul/iş ağı, VPN). Aynı Wi-Fi\'ye geçmeyi dene ya da aşağıdan "Bağlantı testi"ni çalıştır.';
    }
    return 'Host\'a ulaşılamadı (ağ: ' + (st || '?') + '). Host sekmesi açık ve öndeyse mi? Telefonda başka uygulamaya geçince oda kapanabilir. Kodu kontrol et ya da "Bağlantı testi"ni çalıştır.';
  }

  heartbeat() {
    if (this.closed) return;
    this.send({ t: 'ping', c: performance.now(), rtt: Math.round(this.rtt) });
    if (this.state !== 'reconnecting' && performance.now() - this.lastHeard > TIMEOUT_MS) this.lost();
  }

  async lost() {
    if (this.closed || this.state === 'reconnecting') return;
    this.state = 'reconnecting';
    this.h.status('reconnecting');
    while (!this.closed && this.retries < 4) {
      this.retries++;
      try {
        if (this.peer.disconnected && !this.peer.destroyed) this.peer.reconnect();
        await new Promise((r) => setTimeout(r, 1500));
        await this.openConn();
        return; // welcome message will restore state
      } catch { /* retry */ }
    }
    if (!this.closed) this.fail('Host ile bağlantı koptu');
  }

  fail(reason) {
    if (this.closed) return;
    this.close(false);
    this.h.status('closed', { reason });
  }

  send(obj) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(JSON.stringify(obj)); } catch { /* */ }
    }
  }

  close(sayBye = true) {
    if (this.closed) return;
    if (sayBye) this.send({ t: 'bye' });
    this.closed = true;
    clearInterval(this.timer);
    setTimeout(() => { try { this.peer?.destroy(); } catch { /* */ } }, 200);
  }
}

// ---------------------------------------------------------------------------
// Connection self-test: can we reach the signaling server, and which kinds of
// WebRTC candidates does this network give us?
//   host  = local addresses (works on the same Wi-Fi)
//   srflx = public address through STUN (works across most home networks)
//   relay = TURN relay (the fallback for strict networks)
export async function runNetTest(report) {
  const res = { signaling: false, signalErr: '', host: false, srflx: false, relay: false };
  report('1/2 Sinyal sunucusuna bağlanılıyor…');
  try {
    await loadPeerJS();
    await new Promise((ok, bad) => {
      const peer = new window.Peer(peerOptions());
      const t = setTimeout(() => { try { peer.destroy(); } catch { /* */ } bad(new Error('zaman aşımı')); }, 10000);
      peer.on('open', () => { clearTimeout(t); try { peer.destroy(); } catch { /* */ } ok(); });
      peer.on('error', (e) => { clearTimeout(t); try { peer.destroy(); } catch { /* */ } bad(new Error(e.type || e.message)); });
    });
    res.signaling = true;
  } catch (e) { res.signalErr = e.message; }

  report('2/2 Ağ adayları toplanıyor (STUN/TURN)…');
  try {
    const pc = new RTCPeerConnection(iceConfig());
    pc.createDataChannel('t');
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      const m = /typ (host|srflx|relay)/.exec(ev.candidate.candidate);
      if (m) res[m[1]] = true;
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((ok) => {
      const t = setTimeout(ok, 9000);
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); ok(); } };
    });
    pc.close();
  } catch (e) { res.rtcErr = e.message; }

  const lines = [];
  lines.push(res.signaling ? '✔ Sinyal sunucusu: erişilebiliyor' : `✖ Sinyal sunucusu: ULAŞILAMADI (${res.signalErr}). İnterneti, VPN'i, reklam engelleyiciyi ya da DNS'i kontrol et.`);
  lines.push(res.srflx ? '✔ Genel adres (STUN): var' : '✖ Genel adres (STUN): yok — bu ağ WebRTC için kısıtlı olabilir');
  lines.push(res.relay ? '✔ Yedek röle (TURN): var' : '⚠ Yedek röle (TURN): YOK — farklı ağlardaki (özellikle mobil veri) oyuncularla bağlantı kurulamayabilir. Çözüm: Ayarlar → TURN sunucusu bölümüne ücretsiz bir TURN hesabı gir (README\'de adım adım).');
  if (res.signaling && (res.srflx || res.relay)) lines.push('Sonuç: bu cihaz co-op için hazır.');
  else if (res.signaling) lines.push('Sonuç: oda kurabilirsin ama uzak oyuncular bağlanamayabilir. Aynı Wi-Fi\'de dene.');
  else lines.push('Sonuç: co-op şu an çalışmaz. Önce sinyal sunucusuna erişimi çöz.');
  return { res, text: lines.join('\n') };
}
