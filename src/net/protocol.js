// Compact binary snapshot format (host -> clients) + JSON meta section.
import { WEAPON_IDS, WEAPON_INDEX } from '../sim/weapons.js';
import { ENEMY_IDS, ENEMY_INDEX, ENEMIES } from '../sim/enemies.js';
import { POI_TYPES, POI_DEFS } from '../sim/map.js';
import { WEAPONS } from '../sim/weapons.js';
import { PLAYER_RADIUS } from '../config.js';

const MSG_SNAPSHOT = 1;
const P_BYTES = 38, E_BYTES = 12, B_BYTES = 10, EB_BYTES = 8, K_BYTES = 7, T_BYTES = 9, POI_BYTES = 10;
const MAX_EVENTS = 160;
const enc = new TextEncoder();
const dec = new TextDecoder();

const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 4)));
const ang8 = (a) => Math.round(((a % (Math.PI * 2)) + Math.PI * 2) / (Math.PI * 2) * 256) & 255;
const u8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

export function buildInfo(p) {
  return {
    pid: p.pid, name: p.name,
    w: p.weapons.map((w) => [w.id, w.tier]),
    sk: p.skills,
    st: { maxHp: p.st.maxHp, speed: p.st.speed, dashCd: p.st.dashCd, orbitals: p.st.orbitals, pickup: p.st.pickup },
    pk: p.picks, ch: p.choices, k: p.kills, d: Math.round(p.dmg),
  };
}

// Reduce event volume: cosmetic events are dropped first when over budget.
function trimEvents(events) {
  if (events.length <= MAX_EVENTS) return events;
  const important = events.filter((e) => e[0] !== 'hit' && e[0] !== 'burn' && e[0] !== 'xp' && e[0] !== 'eshot');
  const rest = events.filter((e) => e[0] === 'hit');
  return important.concat(rest.slice(-Math.max(0, MAX_EVENTS - important.length)));
}

export function encodeSnapshot(sim, events, includeBuilds) {
  const meta = {
    ph: sim.phase, w: sim.wave, wt: sim.waveTicks, wl: sim.waveLen || 0, cd: sim.countdown, pt: sim.pickTimer,
    lv: sim.level, xp: sim.xp, xn: sim.xpNext, boss: sim.bossId, kills: sim.kills, seed: sim.seedStr,
    ev: trimEvents(events),
  };
  if (includeBuilds) meta.b = sim.players.map(buildInfo);
  const metaBytes = enc.encode(JSON.stringify(meta));
  const P = sim.players, E = sim.enemies, B = sim.bullets, EB = sim.ebullets, K = sim.pickups, T = sim.teles, O = sim.pois;
  const size = 22 + O.length * POI_BYTES + P.length * P_BYTES + E.length * E_BYTES + B.length * B_BYTES + EB.length * EB_BYTES
    + K.length * K_BYTES + T.length * T_BYTES + metaBytes.length;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, MSG_SNAPSHOT); o += 1;
  v.setUint32(o, sim.tick); o += 4;
  v.setUint8(o, P.length); o += 1;
  v.setUint16(o, E.length); o += 2;
  v.setUint16(o, B.length); o += 2;
  v.setUint16(o, EB.length); o += 2;
  v.setUint16(o, K.length); o += 2;
  v.setUint16(o, T.length); o += 2;
  v.setUint32(o, metaBytes.length); o += 4;
  v.setUint16(o, O.length); o += 2;

  for (const p of P) {
    v.setUint8(o, p.pid);
    v.setUint8(o + 1, (p.downed ? 1 : 0) | (p.connected ? 2 : 0));
    v.setFloat32(o + 2, p.x); v.setFloat32(o + 6, p.y);
    v.setFloat32(o + 10, p.vx); v.setFloat32(o + 14, p.vy);
    v.setUint8(o + 18, p.dashT);
    v.setUint16(o + 19, p.dashCd);
    v.setInt16(o + 21, Math.round(p.dashDx * 10000));
    v.setInt16(o + 23, Math.round(p.dashDy * 10000));
    v.setUint8(o + 25, u8(p.iframes));
    v.setFloat32(o + 26, p.hp);
    v.setInt16(o + 30, Math.round(Math.atan2(p.aimY, p.aimX) * 10000));
    v.setUint8(o + 32, u8(p.reviveT));
    v.setUint32(o + 33, p.lastSeq >>> 0);
    v.setUint8(o + 37, Math.min(255, Math.ceil(p.buffT / 12)));
    o += P_BYTES;
  }
  for (const e of E) {
    v.setUint16(o, e.id);
    v.setUint8(o + 2, ENEMY_INDEX[e.type]);
    v.setUint8(o + 3, (e.elite ? 1 : 0) | (e.guardian ? (e.v & 3) << 1 | 8 : 0));
    v.setInt16(o + 4, q(e.x)); v.setInt16(o + 6, q(e.y));
    v.setUint8(o + 8, u8(e.flash));
    v.setUint8(o + 9, u8((e.hp / e.maxHp) * 255));
    v.setUint8(o + 10, ang8((e.boss || e.guardian) && e.charging ? e.cang : e.ang));
    v.setUint8(o + 11, e.boss ? (e.charging | 0) : e.guardian ? ((e.charging | 0) | (e.asleep ? 4 : 0)) : e.state);
    o += E_BYTES;
  }
  for (const b of B) {
    v.setUint16(o, b.id);
    v.setUint8(o + 2, WEAPON_INDEX[b.w]);
    v.setInt16(o + 3, q(b.x)); v.setInt16(o + 5, q(b.y));
    v.setUint8(o + 7, ang8(Math.atan2(b.vy, b.vx)));
    v.setUint8(o + 8, u8(b.r * 4));
    v.setUint8(o + 9, u8(b.t));
    o += B_BYTES;
  }
  for (const b of EB) {
    v.setUint16(o, b.id);
    v.setUint8(o + 2, b.style);
    v.setInt16(o + 3, q(b.x)); v.setInt16(o + 5, q(b.y));
    v.setUint8(o + 7, u8(b.r * 4));
    o += EB_BYTES;
  }
  for (const k of K) {
    v.setUint16(o, k.id);
    v.setUint8(o + 2, k.kind);
    v.setInt16(o + 3, q(k.x)); v.setInt16(o + 5, q(k.y));
    o += K_BYTES;
  }
  for (const t of T) {
    v.setUint16(o, t.id);
    v.setUint8(o + 2, ENEMY_INDEX[t.type]);
    v.setInt16(o + 3, q(t.x)); v.setInt16(o + 5, q(t.y));
    v.setUint8(o + 7, u8(t.t));
    v.setUint8(o + 8, u8(t.dur));
    o += T_BYTES;
  }
  for (const q of O) {
    v.setUint8(o, q.id);
    v.setUint8(o + 1, POI_TYPES.indexOf(q.type));
    v.setInt16(o + 2, q.x * 4); v.setInt16(o + 4, q.y * 4);
    v.setUint8(o + 6, q.state);
    v.setUint8(o + 7, Math.max(0, Math.min(255, q.prog)));
    v.setUint8(o + 8, (q.tier ? 1 : 0) | (q.locked ? 2 : 0));
    v.setUint8(o + 9, 0);
    o += POI_BYTES;
  }
  new Uint8Array(buf, o, metaBytes.length).set(metaBytes);
  return buf;
}

const fromAng8 = (a) => (a / 256) * Math.PI * 2;

export function decodeSnapshot(buf) {
  const v = new DataView(buf);
  let o = 0;
  if (v.getUint8(o) !== MSG_SNAPSHOT) return null;
  o += 1;
  const tick = v.getUint32(o); o += 4;
  const nP = v.getUint8(o); o += 1;
  const nE = v.getUint16(o); o += 2;
  const nB = v.getUint16(o); o += 2;
  const nEB = v.getUint16(o); o += 2;
  const nK = v.getUint16(o); o += 2;
  const nT = v.getUint16(o); o += 2;
  const metaLen = v.getUint32(o); o += 4;
  const nO = v.getUint16(o); o += 2;
  const players = [], enemies = [], bullets = [], ebullets = [], pickups = [], teles = [], pois = [];
  for (let i = 0; i < nP; i++) {
    const flags = v.getUint8(o + 1);
    const a = v.getInt16(o + 30) / 10000;
    players.push({
      pid: v.getUint8(o), id: v.getUint8(o) + 100000,
      downed: !!(flags & 1), connected: !!(flags & 2),
      x: v.getFloat32(o + 2), y: v.getFloat32(o + 6),
      vx: v.getFloat32(o + 10), vy: v.getFloat32(o + 14),
      dashT: v.getUint8(o + 18), dashCd: v.getUint16(o + 19),
      dashDx: v.getInt16(o + 21) / 10000, dashDy: v.getInt16(o + 23) / 10000,
      iframes: v.getUint8(o + 25), hp: v.getFloat32(o + 26),
      aimX: Math.cos(a), aimY: Math.sin(a),
      reviveT: v.getUint8(o + 32), lastSeq: v.getUint32(o + 33),
      r: PLAYER_RADIUS, buffT: v.getUint8(o + 37) * 12,
    });
    o += P_BYTES;
  }
  for (let i = 0; i < nE; i++) {
    const type = ENEMY_IDS[v.getUint8(o + 2)];
    const flags = v.getUint8(o + 3);
    const state = v.getUint8(o + 11);
    const ang = fromAng8(v.getUint8(o + 10));
    const boss = type === 'gozcu';
    const guardian = !!(flags & 8);
    enemies.push({
      id: v.getUint16(o), type, elite: !!(flags & 1), boss, guardian, v: (flags >> 1) & 3,
      asleep: guardian && !!(state & 4), r: ENEMIES[type].r * (flags & 1 ? 1.3 : 1),
      x: v.getInt16(o + 4) / 4, y: v.getInt16(o + 6) / 4,
      flash: v.getUint8(o + 8), hp: v.getUint8(o + 9) / 255, maxHp: 1,
      ang, cang: ang, state, charging: boss ? state : guardian ? state & 3 : 0,
    });
    o += E_BYTES;
  }
  for (let i = 0; i < nB; i++) {
    const w = WEAPON_IDS[v.getUint8(o + 2)];
    const a = fromAng8(v.getUint8(o + 7));
    bullets.push({
      id: v.getUint16(o), w, kind: WEAPONS[w].kind,
      x: v.getInt16(o + 3) / 4, y: v.getInt16(o + 5) / 4,
      vx: Math.cos(a), vy: Math.sin(a), r: v.getUint8(o + 8) / 4, t: v.getUint8(o + 9),
    });
    o += B_BYTES;
  }
  for (let i = 0; i < nEB; i++) {
    ebullets.push({ id: v.getUint16(o), style: v.getUint8(o + 2), x: v.getInt16(o + 3) / 4, y: v.getInt16(o + 5) / 4, r: v.getUint8(o + 7) / 4 });
    o += EB_BYTES;
  }
  for (let i = 0; i < nK; i++) {
    pickups.push({ id: v.getUint16(o), kind: v.getUint8(o + 2), x: v.getInt16(o + 3) / 4, y: v.getInt16(o + 5) / 4 });
    o += K_BYTES;
  }
  for (let i = 0; i < nT; i++) {
    teles.push({ id: v.getUint16(o), type: ENEMY_IDS[v.getUint8(o + 2)], x: v.getInt16(o + 3) / 4, y: v.getInt16(o + 5) / 4, t: v.getUint8(o + 7), dur: v.getUint8(o + 8) });
    o += T_BYTES;
  }
  for (let i = 0; i < nO; i++) {
    const type = POI_TYPES[v.getUint8(o + 1)];
    const f = v.getUint8(o + 8);
    pois.push({
      id: v.getUint8(o), type, x: v.getInt16(o + 2) / 4, y: v.getInt16(o + 4) / 4,
      state: v.getUint8(o + 6), prog: v.getUint8(o + 7), tier: f & 1, locked: !!(f & 2), r: POI_DEFS[type].r,
    });
    o += POI_BYTES;
  }
  const meta = JSON.parse(dec.decode(new Uint8Array(buf, o, metaLen)));
  return { tick, players, enemies, bullets, ebullets, pickups, teles, pois, meta };
}
