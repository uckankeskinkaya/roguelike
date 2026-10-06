// Entry point: wires simulation, rendering, input, audio, UI and networking.
import { TICK_MS, SNAPSHOT_EVERY, PLAYER_COLORS, FINAL_WAVE } from './config.js';
import { hashSeed, randomSeedString } from './rng.js';
import { Sim } from './sim/world.js';
import { WEAPONS } from './sim/weapons.js';
import { Renderer } from './render/renderer.js';
import { FX } from './render/fx.js';
import { drawHUD } from './render/hud.js';
import { Input } from './input/input.js';
import { initAudio, setVolumes, music } from './audio/sfx.js';
import { UI, $ } from './ui/ui.js';
import { HostSession, ClientSession, setSignaling } from './net/net.js';
import { encodeSnapshot, decodeSnapshot } from './net/protocol.js';
import { ClientWorld } from './net/clientworld.js';

// ------------------------------------------------------------------ setup
const canvas = $('game');
const fx = new FX();
const renderer = new Renderer(canvas, fx);
const input = new Input(canvas);
const ui = new UI();

const store = {
  get(k, d) { try { const v = localStorage.getItem('nk-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nk-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const settings = Object.assign({ name: '', sfx: 0.8, music: 0.55, shake: 1, numbers: true }, store.get('settings', {}));
function saveSettings() { store.set('settings', settings); }

// per-tab client id (survives reloads, so a refreshed tab can rejoin its body)
let cid = sessionStorage.getItem('nk-cid');
if (!cid) { cid = randomSeedString(10); sessionStorage.setItem('nk-cid', cid); }

const G = {
  mode: 'menu',            // menu | single | host | client
  sim: null,
  host: null,              // HostSession
  net: null,               // ClientSession
  cw: null,                // ClientWorld
  localPid: 0,
  paused: false,
  acc: 0,
  hitstop: 0,
  netEvents: [],
  buildSig: '',
  snapCount: 0,
  seedStr: '',
  lobby: [],
  code: '',
  overAt: 0,
  overShown: false,
  view: null,
};

// --------------------------------------------------------------- helpers
const inGame = () => G.mode === 'single' || ((G.mode === 'host') && G.sim) || (G.mode === 'client' && G.cw);
const playerName = () => (settings.name || '').trim() || 'Gezgin';

function applySettings() {
  setVolumes(settings.sfx, settings.music);
  fx.shakeScale = settings.shake;
  fx.showNumbers = settings.numbers;
}

function resetPresentation() {
  fx.reset();
  renderer.clearDecals();
  G.acc = 0; G.hitstop = 0; G.netEvents = []; G.buildSig = ''; G.snapCount = 0;
  G.overShown = false; G.overAt = 0; G.paused = false;
  ui.cardSig = '';
}

function setPlaying(on) {
  document.body.classList.toggle('playing', on);
  $('btn-pause').hidden = !on;
}

function localPlayerPos() {
  if (G.mode === 'client' && G.cw) return G.cw.pred ? { x: G.cw.pred.x, y: G.cw.pred.y } : null;
  if (G.sim) { const p = G.sim.playerByPid(G.localPid); return p ? { x: p.x, y: p.y } : null; }
  return null;
}

function aimFromMouse(sx, sy) {
  const p = localPlayerPos();
  if (!p) return null;
  const w = renderer.screenToWorld(sx, sy);
  const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
  if (d < 4) return null;
  return { x: dx / d, y: dy / d };
}

// ---------------------------------------------------------- single player
function startSingle(seedStr) {
  leaveNetwork();
  G.seedStr = (seedStr || randomSeedString()).toUpperCase();
  G.sim = new Sim(hashSeed(G.seedStr), G.seedStr);
  G.sim.addPlayer(cid, playerName());
  G.localPid = 0;
  G.mode = 'single';
  resetPresentation();
  ui.hideAll();
  setPlaying(true);
  music.setIntensity(1);
}

// -------------------------------------------------------------- host side
async function createRoom() {
  leaveNetwork();
  $('btn-host').disabled = true;
  ui.toast('Oda oluşturuluyor…');
  const host = new HostSession({
    inGame: () => !!G.sim,
    hasPlayer: (c) => !!(G.sim && G.sim.playerByCid(c)),
    join: (c, name) => {
      if (!G.sim) return null;
      let p = G.sim.playerByCid(c);
      if (p) { G.sim.setConnected(c, true); ui.toast(`${p.name} yeniden bağlandı`); host.broadcast({ t: 'toast', msg: `${p.name} yeniden bağlandı` }); }
      else {
        if (G.sim.players.length >= 8) return null;
        p = G.sim.addPlayer(c, name);
        ui.toast(`${name} oyuna katıldı`);
        host.broadcast({ t: 'toast', msg: `${name} oyuna katıldı` });
      }
      G.buildSig = '';
      return p.pid;
    },
    leave: (c, voluntary, name) => {
      if (G.sim) {
        if (voluntary) G.sim.removePlayer(c); else G.sim.setConnected(c, false);
        const msg = voluntary ? `${name} oyundan ayrıldı` : `${name} bağlantısı koptu`;
        ui.toast(msg);
        host.broadcast({ t: 'toast', msg });
        G.buildSig = '';
      } else ui.toast(`${name} lobiden ayrıldı`);
    },
    pick: (pid, i) => { if (G.sim) G.sim.choose(pid, i); },
    lobbyChanged: (list) => { G.lobby = list; if (!G.sim) ui.renderLobby(list, G.code, true); },
    log: (t) => console.warn(t),
  });
  try {
    G.code = await host.open(playerName(), cid);
    G.host = host;
    G.mode = 'host';
    G.lobby = host.lobbyList();
    ui.renderLobby(G.lobby, G.code, true);
    ui.show('scr-lobby');
    history.replaceState(null, '', `?oda=${G.code}`);
  } catch (e) {
    ui.toast(e.message || 'Oda kurulamadı');
    try { host.close(); } catch { /* */ }
  } finally {
    $('btn-host').disabled = false;
  }
}

function hostStart() {
  if (G.mode !== 'host' || !G.host) return;
  G.seedStr = randomSeedString();
  G.sim = new Sim(hashSeed(G.seedStr), G.seedStr);
  const me = G.sim.addPlayer(cid, playerName());
  G.localPid = me.pid;
  const pids = new Map();
  for (const p of G.host.lobbyList()) if (!p.host) pids.set(p.cid, G.sim.addPlayer(p.cid, p.name).pid);
  G.host.startGame((c) => pids.get(c), G.seedStr);
  resetPresentation();
  ui.hideAll();
  setPlaying(true);
  music.setIntensity(1);
}

function hostBackToLobby() {
  G.sim = null;
  G.host.backToLobby();
  setPlaying(false);
  music.setIntensity(0);
  ui.renderLobby(G.host.lobbyList(), G.code, true);
  ui.show('scr-lobby');
}

// ------------------------------------------------------------ client side
async function joinRoom(code) {
  code = (code || '').trim().toUpperCase();
  if (code.length < 4) { $('join-msg').textContent = 'Geçerli bir oda kodu gir'; return; }
  leaveNetwork();
  $('join-msg').textContent = 'Bağlanılıyor…';
  $('btn-join-go').disabled = true;
  const net = new ClientSession({
    message: onClientMessage,
    snapshot: (buf) => {
      if (!G.cw) return;
      const s = decodeSnapshot(buf);
      if (!s) return;
      const now = performance.now();
      const immediate = G.cw.onSnapshot(s, now);
      if (immediate.length) fx.consume(immediate, G.localPid, localPlayerPos());
    },
    status: (state, info) => {
      if (state === 'reconnecting') ui.netStatus('Bağlantı koptu — yeniden bağlanılıyor…');
      else if (state === 'closed') {
        ui.netStatus('');
        const reason = info && info.reason ? info.reason : 'Bağlantı kapandı';
        G.net = null;
        quitToMenu(false);
        ui.toast(reason);
        $('join-msg').textContent = reason;
      } else ui.netStatus('');
    },
  });
  G.net = net;
  G.code = code;
  try {
    await net.connect(code, cid, playerName());
  } catch (e) {
    $('join-msg').textContent = e.message || 'Bağlanılamadı';
    net.close(false);
    if (G.net === net) G.net = null;
  } finally {
    $('btn-join-go').disabled = false;
  }
}

function onClientMessage(m) {
  switch (m.t) {
    case 'welcome':
      G.mode = 'client';
      if (m.state === 'lobby') {
        G.cw = null;
        ui.renderLobby(G.lobby.length ? G.lobby : [{ name: '…' }], m.code, false);
        ui.show('scr-lobby');
        history.replaceState(null, '', `?oda=${m.code}`);
      } else if (!G.cw || G.cw.localPid !== m.pid) {
        startClientGame(m.pid);
      }
      break;
    case 'lobby':
      G.lobby = m.players;
      if (!G.cw) ui.renderLobby(m.players, m.code, false);
      break;
    case 'start':
      startClientGame(m.pid);
      break;
    case 'tolobby':
      G.cw = null;
      setPlaying(false);
      music.setIntensity(0);
      ui.renderLobby(G.lobby, G.code, false);
      ui.show('scr-lobby');
      break;
    case 'toast':
      ui.toast(m.msg);
      break;
  }
}

function startClientGame(pid) {
  G.cw = new ClientWorld(pid);
  G.localPid = pid;
  G.mode = 'client';
  resetPresentation();
  ui.hideAll();
  setPlaying(true);
  music.setIntensity(1);
}

// ------------------------------------------------------------ lifecycle
function leaveNetwork() {
  if (G.host) { G.host.close(); G.host = null; }
  if (G.net) { G.net.close(true); G.net = null; }
  G.cw = null;
  G.lobby = [];
  ui.netStatus('');
}

function quitToMenu(leave = true) {
  if (leave) leaveNetwork();
  G.sim = null;
  G.cw = null;
  G.mode = 'menu';
  G.paused = false;
  G.view = null;
  setPlaying(false);
  music.setIntensity(0);
  $('scr-pick').hidden = true;
  $('pick-wait').hidden = true;
  history.replaceState(null, '', location.pathname);
  ui.show('scr-menu');
  showBest();
}

function togglePause() {
  if (!inGame()) return;
  if (ui.current === 'scr-pause') { resume(); return; }
  if (ui.current) return;
  if (G.view && (G.view.phase === 'gameover' || G.view.phase === 'victory')) return;
  G.paused = G.mode === 'single';
  $('pause-title').textContent = G.mode === 'single' ? 'Duraklatıldı' : 'Menü (oyun devam ediyor)';
  const me = G.view && G.view.players.find((p) => p.pid === G.localPid);
  if (me) ui.fillBuild($('pause-build'), me); else $('pause-build').innerHTML = '';
  $('btn-quit').textContent = G.mode === 'single' ? 'Ana Menü' : 'Oyundan Ayrıl';
  ui.show('scr-pause');
}

function resume() {
  G.paused = false;
  ui.hideAll();
}

function showOver(view) {
  const win = view.phase === 'victory';
  $('over-title').textContent = win ? 'ZAFER' : (G.mode === 'single' ? 'ÖLDÜN' : 'TAKIM DÜŞTÜ');
  $('over-title').style.color = win ? '#7dff6a' : '#ff3d5e';
  $('over-sub').textContent = win ? 'Kor Gözcü sustu. Kuyu şimdilik sessiz.' : `Dalga ${view.wave} / ${FINAL_WAVE} — kuyu seni yuttu.`;
  const st = $('over-stats');
  st.innerHTML = '';
  const add = (label, val, wide = false) => {
    const d = document.createElement('div');
    if (wide) { d.className = 'wide'; d.textContent = val; }
    else { const b = document.createElement('b'); b.textContent = val; const s = document.createElement('span'); s.textContent = label; d.append(b, s); }
    st.append(d);
  };
  add('Dalga', String(view.wave));
  add('Seviye', String(view.level));
  add('Öldürme', String(view.kills));
  add('Tohum', view.seedStr || G.seedStr);
  if (view.players.length > 1) {
    for (const p of [...view.players].sort((a, b) => (b.dmg || 0) - (a.dmg || 0))) {
      add('', `${p.name}: ${Math.round(p.dmg || 0).toLocaleString('tr-TR')} hasar · ${p.kills || 0} öldürme · ${p.weapons.map((w) => WEAPONS[w.id].name).join(', ')}`, true);
    }
  }
  const single = G.mode === 'single';
  $('btn-again').hidden = G.mode === 'client';
  $('btn-again').textContent = single ? 'Yeni Koşu' : 'Lobiye Dön';
  $('btn-same').hidden = !single;
  $('btn-over-menu').textContent = single ? 'Ana Menü' : 'Oyundan Ayrıl';
  if (G.mode === 'client') $('over-sub').textContent += ' Host\'un lobiye dönmesi bekleniyor…';
  ui.show('scr-over');
  // record
  const best = store.get('best', { wave: 0, kills: 0 });
  if (view.wave > best.wave || (view.wave === best.wave && view.kills > best.kills)) store.set('best', { wave: view.wave, kills: view.kills, win });
}

function showBest() {
  const b = store.get('best', null);
  $('best').textContent = b ? `En iyi: dalga ${b.wave}${b.win ? ' (zafer)' : ''} · ${b.kills} öldürme` : '';
}

// --------------------------------------------------------------- the loop
function authoritativeTick() {
  const inputs = new Map();
  inputs.set(G.localPid, input.sample(aimFromMouse));
  if (G.mode === 'host' && G.host) {
    for (const p of G.sim.players) {
      if (p.pid === G.localPid) continue;
      const inp = G.host.takeInput(p.pid);
      if (inp) inputs.set(p.pid, inp);
    }
  }
  G.sim.step(inputs);
  const ev = G.sim.drainEvents();
  if (ev.length) {
    fx.consume(ev, G.localPid, localPlayerPos());
    if (G.mode === 'host') for (const e of ev) G.netEvents.push(e);
  }
  if (G.mode === 'host' && G.host && G.sim.tick % SNAPSHOT_EVERY === 0) {
    const sig = G.sim.players.map((p) => `${p.pid}:${p.buildVer}:${p.connected}`).join(',') + G.sim.phase;
    const builds = sig !== G.buildSig || G.snapCount % 20 === 0;
    G.buildSig = sig;
    G.snapCount++;
    G.host.sendSnapshot(encodeSnapshot(G.sim, G.netEvents, builds));
    G.netEvents = [];
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll(dt);
  ui.gamepadMode = input.device === 'gamepad';

  const pickVisible = !$('scr-pick').hidden;
  input.enabled = !ui.current && !pickVisible;

  let view = null, alpha = 1, localPos = null;
  if (G.sim && (G.mode === 'single' || G.mode === 'host')) {
    if (!G.paused) {
      if (G.hitstop > 0) G.hitstop -= dt * 1000;
      else G.acc += dt * 1000;
      if (G.acc > 250) G.acc = 250; // tab was in background: don't fast-forward
      while (G.acc >= TICK_MS) { G.acc -= TICK_MS; authoritativeTick(); }
      if (fx.hitstopMs > 0) {
        const solo = G.sim.players.length === 1;
        G.hitstop = Math.max(G.hitstop, solo ? fx.hitstopMs : Math.min(80, fx.hitstopMs * 0.5));
        fx.hitstopMs = 0;
      }
    }
    view = G.sim;
    alpha = G.paused || G.hitstop > 0 ? 1 : G.acc / TICK_MS;
  } else if (G.mode === 'client' && G.cw) {
    G.acc += dt * 1000;
    if (G.acc > 250) G.acc = 250;
    while (G.acc >= TICK_MS) {
      G.acc -= TICK_MS;
      const { msg, dashed } = G.cw.localTick(input.sample(aimFromMouse));
      if (G.net) G.net.send(msg);
      if (dashed === 1 && G.cw.pred) {
        const p = G.cw.pred;
        fx.consume([['dash', G.localPid, p.x, p.y, p.dashDx, p.dashDy]], G.localPid, p);
      }
    }
    fx.hitstopMs = 0;
    view = G.cw.view(now);
    const ev = G.cw.takeEvents(now);
    if (ev.length) fx.consume(ev, G.localPid, localPlayerPos());
    localPos = G.cw.localPos(G.acc / TICK_MS);
  }
  G.view = view;

  let localAim = null;
  if (view && input.device === 'kbm' && input.enabled) localAim = aimFromMouse(input.mouse.x, input.mouse.y);
  renderer.render(view, alpha, G.localPid, dt, { localAim, localPos });

  if (view) {
    let netText = '';
    if (G.mode === 'client' && G.net) netText = `ping ${Math.round(G.net.rtt)} ms · oda ${G.code}`;
    else if (G.mode === 'host' && G.host) netText = `oda ${G.code} · ${G.sim.players.filter((p) => p.connected).length} oyuncu`;
    let hint = '';
    if (view.wave <= 1 && view.phase !== 'gameover') {
      hint = input.device === 'gamepad' ? 'Sol analog: hareket · Sağ analog: nişan · A/RB: atıl · Start: menü'
        : input.device === 'touch' ? ''
          : 'WASD: hareket · Fare: nişan · Boşluk: atıl · Silahlar otomatik ateş eder · Esc: menü';
    }
    drawHUD(renderer, view, G.localPid, { netText, hint, hideBanner: !$('scr-pick').hidden });
    input.drawTouch(renderer.ctx);
    if (input.device === 'kbm' && input.enabled) drawCrosshair();

    const me = view.players.find((p) => p.pid === G.localPid);
    if (!ui.current) {
      ui.updatePick(view, me, (i) => {
        if (G.mode === 'client') G.net && G.net.send({ t: 'pick', i });
        else G.sim.choose(G.localPid, i);
      });
    }
    if ((view.phase === 'gameover' || view.phase === 'victory') && !G.overShown) {
      if (!G.overAt) G.overAt = now + 1600;
      else if (now > G.overAt) { G.overShown = true; $('scr-pick').hidden = true; $('pick-wait').hidden = true; showOver(view); }
    }
  }
}

function drawCrosshair() {
  const { ctx, dpr } = renderer;
  const { x, y } = input.mouse;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = PLAYER_COLORS[G.localPid] || '#fff';
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 15, y);
  ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 15);
  ctx.stroke();
}

// ------------------------------------------------------------- UI wiring
for (const id of ['in-name', 'in-name-join']) {
  $(id).value = settings.name;
  $(id).addEventListener('input', (e) => {
    settings.name = e.target.value.slice(0, 16);
    saveSettings();
    for (const o of ['in-name', 'in-name-join']) if (o !== id) $(o).value = settings.name;
  });
}
$('btn-solo').addEventListener('click', () => startSingle($('in-seed').value.trim()));
$('btn-host').addEventListener('click', () => createRoom());
$('btn-join').addEventListener('click', () => { $('join-msg').textContent = ''; ui.show('scr-join', true); $('in-code').focus(); });
$('btn-join-go').addEventListener('click', () => joinRoom($('in-code').value));
$('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('in-code').value); });
$('in-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('btn-start').addEventListener('click', () => hostStart());
ui.onBack['scr-lobby'] = () => quitToMenu(true);
$('btn-copy').addEventListener('click', async () => {
  const sig = store.get('signal', '');
  const link = `${location.origin}${location.pathname}?oda=${G.code}${sig ? `&sinyal=${encodeURIComponent(sig)}` : ''}`;
  try {
    if (navigator.share && input.device === 'touch') await navigator.share({ title: 'Neon Kuyu', text: `Oda kodu: ${G.code}`, url: link });
    else { await navigator.clipboard.writeText(link); ui.toast('Davet linki kopyalandı'); }
  } catch { window.prompt('Davet linki:', link); }
});
$('btn-help').addEventListener('click', () => ui.show('scr-help', true));
$('btn-settings').addEventListener('click', () => openSettings());
$('btn-pause-settings').addEventListener('click', () => openSettings());
$('btn-resume').addEventListener('click', () => resume());
ui.onBack['scr-pause'] = () => resume();
$('btn-quit').addEventListener('click', () => quitToMenu(true));
$('btn-pause').addEventListener('click', () => togglePause());
$('btn-again').addEventListener('click', () => {
  if (G.mode === 'single') startSingle('');
  else if (G.mode === 'host') hostBackToLobby();
});
$('btn-same').addEventListener('click', () => startSingle(G.seedStr));
$('btn-over-menu').addEventListener('click', () => quitToMenu(true));
ui.onBack['scr-over'] = () => {};
$('btn-fs').addEventListener('click', () => toggleFullscreen());

function openSettings() {
  $('set-sfx').value = settings.sfx;
  $('set-music').value = settings.music;
  $('set-shake').value = settings.shake;
  $('set-numbers').checked = settings.numbers;
  ui.show('scr-settings', true);
}
for (const [id, key] of [['set-sfx', 'sfx'], ['set-music', 'music'], ['set-shake', 'shake']]) {
  $(id).addEventListener('input', (e) => { settings[key] = parseFloat(e.target.value); applySettings(); saveSettings(); });
}
$('set-numbers').addEventListener('change', (e) => { settings.numbers = e.target.checked; applySettings(); saveSettings(); });

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape').catch(() => {});
    } else await document.exitFullscreen();
  } catch { ui.toast('Tam ekran desteklenmiyor'); }
}

// keyboard shortcuts for cards
addEventListener('keydown', (e) => {
  if (!$('scr-pick').hidden && /^Digit[1-3]$/.test(e.code)) {
    const cards = $('cards').querySelectorAll('.card');
    const c = cards[+e.code.slice(5) - 1];
    if (c) c.click();
  }
});

input.onPause = () => togglePause();
input.onNav = (dir) => { if (ui.current || !$('scr-pick').hidden) ui.nav(dir); };
input.onDevice = (d) => { document.body.dataset.device = d; };

// audio needs a user gesture
const unlock = () => { initAudio(); applySettings(); };
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });
addEventListener('gamepadconnected', unlock);

addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'single' && G.sim && !ui.current) togglePause();
});
addEventListener('beforeunload', () => leaveNetwork());

// PWA: install prompt + service worker
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('btn-install').hidden = false; });
$('btn-install').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null;
  $('btn-install').hidden = true;
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW kaydı başarısız', e));
}

// deep link: ?oda=CODE  (+ optional &sinyal=host:port/path for a self-hosted PeerJS server)
const params = new URLSearchParams(location.search);
const signal = params.get('sinyal');
if (signal !== null) store.set('signal', signal);
setSignaling(store.get('signal', ''));
const room = (params.get('oda') || params.get('room') || '').toUpperCase();
applySettings();
showBest();
if (room) {
  ui.show('scr-menu');
  ui.show('scr-join', true);
  $('in-code').value = room;
  $('join-msg').textContent = 'Davet linkiyle geldin — adını yazıp Katıl\'a bas.';
  if (!settings.name) $('in-name-join').focus();
} else ui.show('scr-menu');

// debug/automation hook
window.__nk = { G, ui, input, fx, renderer };

requestAnimationFrame(frame);
