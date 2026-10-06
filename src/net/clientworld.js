// Client-side view of a host-authoritative game: snapshot interpolation for
// everything, plus client-side prediction + reconciliation for the local player.
import { TICK_MS, INTERP_TICKS } from '../config.js';
import { stepMovement, dashCooldownTicks } from '../sim/player.js';

const lerp = (a, b, t) => a + (b - a) * t;
const MOVE_KEYS = ['x', 'y', 'vx', 'vy', 'dashT', 'dashCd', 'dashDx', 'dashDy', 'downed'];

export class ClientWorld {
  constructor(localPid) {
    this.localPid = localPid;
    this.snaps = [];
    this.builds = new Map();
    this.offset = null;
    this.pending = [];       // [{tick, ev}]
    this.pred = null;
    this.prevPred = null;
    this.history = [];
    this.seq = 0;
    this.errX = 0; this.errY = 0;
    this.lastSnapAt = 0;
  }

  latest() { return this.snaps[this.snaps.length - 1]; }

  onSnapshot(s, now) {
    const last = this.latest();
    if (last && s.tick <= last.tick) return [];
    if (s.meta.b) {
      this.builds.clear();
      for (const b of s.meta.b) this.builds.set(b.pid, b);
    }
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
    this.lastSnapAt = now;

    const sample = s.tick - now / TICK_MS;
    if (this.offset === null || Math.abs(sample - this.offset) > 30) this.offset = sample;
    else this.offset += (sample - this.offset) * (sample > this.offset ? 0.2 : 0.04);

    // events: the local player's own actions play immediately, the rest are
    // released when the interpolated timeline reaches their tick
    const immediate = [];
    const delayed = [];
    for (const e of s.meta.ev || []) {
      if (e[0] === 'dash' && e[1] === this.localPid) continue; // predicted locally
      if ((e[0] === 'shoot' || e[0] === 'hurt' || e[0] === 'xp' || e[0] === 'pick') && e[1] === this.localPid) immediate.push(e);
      else if (e[0] === 'stop') continue;
      else delayed.push(e);
    }
    if (delayed.length) this.pending.push({ tick: s.tick, ev: delayed });
    this.reconcile(s);
    return immediate;
  }

  reconcile(s) {
    const me = s.players.find((p) => p.pid === this.localPid);
    const b = this.builds.get(this.localPid);
    if (!me || !b) { this.pred = null; return; }
    const before = this.pred ? { x: this.pred.x + this.errX, y: this.pred.y + this.errY } : null;
    this.history = this.history.filter((h) => h.seq > me.lastSeq);
    const pred = {};
    for (const k of MOVE_KEYS) pred[k] = me[k];
    pred.aimX = me.aimX; pred.aimY = me.aimY;
    if (s.meta.ph !== 'gameover' && s.meta.ph !== 'victory') {
      for (const h of this.history) this.applyInput(pred, h.input, b);
    }
    if (before) {
      this.errX = before.x - pred.x;
      this.errY = before.y - pred.y;
      if (Math.hypot(this.errX, this.errY) > 160) { this.errX = 0; this.errY = 0; }
    }
    this.pred = pred;
    if (!this.prevPred) this.prevPred = { ...pred };
  }

  applyInput(pred, input, build) {
    if (Math.hypot(input.ax, input.ay) > 0.2) { pred.aimX = input.ax; pred.aimY = input.ay; }
    return stepMovement(pred, input, build.st.speed, dashCooldownTicks(build.st.dashCd));
  }

  // One local fixed tick: predict and return the message to send.
  localTick(input) {
    const msg = { t: 'in', s: ++this.seq, mx: +input.mx.toFixed(3), my: +input.my.toFixed(3), ax: +input.ax.toFixed(3), ay: +input.ay.toFixed(3), d: input.dash ? 1 : 0 };
    const b = this.builds.get(this.localPid);
    const s = this.latest();
    let dashed = 0;
    if (this.pred && b && s && s.meta.ph !== 'gameover' && s.meta.ph !== 'victory') {
      this.prevPred = { x: this.pred.x, y: this.pred.y };
      const inp = { mx: msg.mx, my: msg.my, ax: msg.ax, ay: msg.ay, dash: !!msg.d };
      dashed = this.applyInput(this.pred, inp, b);
      this.history.push({ seq: msg.s, input: inp });
      if (this.history.length > 180) this.history.shift();
    }
    const k = Math.pow(0.0005, 1 / 60);
    this.errX *= k; this.errY *= k;
    return { msg, dashed };
  }

  localPos(alpha) {
    if (!this.pred || !this.prevPred) return null;
    return { x: lerp(this.prevPred.x, this.pred.x, alpha) + this.errX, y: lerp(this.prevPred.y, this.pred.y, alpha) + this.errY };
  }

  renderTick(now) {
    return now / TICK_MS + (this.offset || 0) - INTERP_TICKS;
  }

  takeEvents(now) {
    const rt = this.renderTick(now);
    const out = [];
    while (this.pending.length && this.pending[0].tick <= rt + 1) out.push(...this.pending.shift().ev);
    // never let cosmetic events pile up
    if (this.pending.length > 30) for (const p of this.pending.splice(0)) out.push(...p.ev);
    return out;
  }

  view(now) {
    const S = this.snaps;
    if (!S.length) return null;
    const rt = this.renderTick(now);
    let a = S[0], b = S[S.length - 1];
    for (let i = S.length - 1; i > 0; i--) {
      if (S[i - 1].tick <= rt) { a = S[i - 1]; b = S[i]; break; }
    }
    let t = b.tick === a.tick ? 1 : (rt - a.tick) / (b.tick - a.tick);
    t = Math.max(0, Math.min(1, t));
    const latest = this.latest();
    const m = latest.meta;
    const interp = (listA, listB) => {
      const idx = listA._idx || (listA._idx = new Map(listA.map((e) => [e.id, e])));
      return listB.map((e) => {
        const o = idx.get(e.id);
        if (!o) return e;
        const r = Object.assign({}, e);
        r.x = lerp(o.x, e.x, t);
        r.y = lerp(o.y, e.y, t);
        return r;
      });
    };
    const players = interp(a.players, b.players).map((p) => {
      // HUD-relevant values come from the newest snapshot
      const lp = latest.players.find((q) => q.pid === p.pid) || p;
      const bi = this.builds.get(p.pid);
      const out = Object.assign({}, p, {
        hp: lp.hp, downed: lp.downed, connected: lp.connected, reviveT: lp.reviveT, dashCd: lp.dashCd,
        name: bi ? bi.name : `Oyuncu ${p.pid + 1}`,
        weapons: bi ? bi.w.map(([id, tier]) => ({ id, tier })) : [],
        skills: bi ? bi.sk : {},
        st: bi ? bi.st : { maxHp: 100, speed: 1, dashCd: 0, orbitals: 0 },
        picks: bi ? bi.pk : 0, choices: bi ? bi.ch : [], kills: bi ? bi.k : 0, dmg: bi ? bi.d : 0,
      });
      if (p.pid === this.localPid && this.pred) {
        out.dashT = this.pred.dashT; out.dashCd = this.pred.dashCd;
        out.vx = this.pred.vx; out.vy = this.pred.vy;
      }
      return out;
    });
    return {
      tick: Math.round(rt),
      phase: m.ph, wave: m.w, waveTicks: m.wt, waveLen: m.wl, countdown: m.cd, pickTimer: m.pt,
      level: m.lv, xp: m.xp, xpNext: m.xn, bossId: m.boss, kills: m.kills, seedStr: m.seed,
      players,
      enemies: interp(a.enemies, b.enemies),
      bullets: interp(a.bullets, b.bullets),
      ebullets: interp(a.ebullets, b.ebullets),
      pickups: interp(a.pickups, b.pickups),
      teles: b.teles,
    };
  }
}
