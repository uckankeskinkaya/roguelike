// The authoritative game simulation. Fixed time step, no rendering, no DOM.
// Single-player and the co-op host both run this; clients only render snapshots.
import {
  DT, TICK_RATE, ARENA_W, ARENA_H, PLAYER_RADIUS, MAX_WEAPONS, FINAL_WAVE,
  PICK_TIMEOUT, REVIVE_TICKS, DASH_TICKS,
} from '../config.js';
import { RNG } from '../rng.js';
import { WEAPONS, WEAPON_IDS, STARTER_WEAPONS, MAX_TIER, weaponStats } from './weapons.js';
import { SKILLS, computeStats } from './skills.js';
import { ENEMIES, AI, clampToArena, BURN_TICKS } from './enemies.js';
import { stepMovement, dashCooldownTicks } from './player.js';
import {
  isBossWave, waveDuration, spawnRate, hpScale, dmgScale, eliteChance, xpForLevel, poolFor,
} from './waves.js';

const TAU = Math.PI * 2;
const CELL = 64;
const GW = Math.ceil(ARENA_W / CELL) + 1;
const GH = Math.ceil(ARENA_H / CELL) + 1;

class Grid {
  constructor() { this.cells = Array.from({ length: GW * GH }, () => []); }
  clear() { for (const c of this.cells) c.length = 0; }
  insert(e) {
    const cx = Math.max(0, Math.min(GW - 1, (e.x / CELL) | 0));
    const cy = Math.max(0, Math.min(GH - 1, (e.y / CELL) | 0));
    this.cells[cy * GW + cx].push(e);
  }
  // calls fn(e) for every entity whose cell overlaps the circle (x, y, r)
  query(x, y, r, fn) {
    const x0 = Math.max(0, ((x - r - 60) / CELL) | 0), x1 = Math.min(GW - 1, ((x + r + 60) / CELL) | 0);
    const y0 = Math.max(0, ((y - r - 60) / CELL) | 0), y1 = Math.min(GH - 1, ((y + r + 60) / CELL) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.cells[cy * GW + cx];
        for (let i = 0; i < c.length; i++) if (fn(c[i]) === true) return;
      }
    }
  }
}

export const PICKUP = { XP: 0, XP_BIG: 1, HEART: 2 };

export class Sim {
  constructor(seedNum, seedStr = '') {
    this.seed = seedNum;
    this.seedStr = seedStr;
    this.rng = new RNG(seedNum);
    this.tick = 0;
    this.phase = 'pick';       // pick | countdown | wave | gameover | victory
    this.wave = 0;
    this.waveTicks = 0;
    this.countdown = 0;
    this.pickTimer = PICK_TIMEOUT;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.levelsThisWave = 0;
    this.players = [];
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.pickups = [];
    this.teles = [];
    this.nextId = 1;
    this.events = [];
    this.bossId = 0;
    this.spawnAcc = 0;
    this.hordeDone = false;
    this.kills = 0;
    this.grid = new Grid();
  }

  id() {
    const id = this.nextId;
    this.nextId = this.nextId >= 65000 ? 1 : this.nextId + 1;
    return id;
  }

  emit(...ev) { this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  // ---------------------------------------------------------------- players
  addPlayer(cid, name) {
    const used = new Set(this.players.map((p) => p.pid));
    let pid = 0;
    while (used.has(pid)) pid++;
    const alive = this.players.find((p) => p.connected && !p.downed);
    const ang = this.rng.range(0, TAU);
    const p = {
      pid, cid, name: name || `Oyuncu ${pid + 1}`,
      x: alive ? alive.x + Math.cos(ang) * 50 : ARENA_W / 2 + (pid % 4 - 1.5) * 60,
      y: alive ? alive.y + Math.sin(ang) * 50 : ARENA_H / 2 + (pid >= 4 ? 60 : 0),
      vx: 0, vy: 0, px: 0, py: 0, r: PLAYER_RADIUS,
      hp: 100, iframes: 60,
      dashT: 0, dashCd: 0, dashDx: 1, dashDy: 0,
      aimX: 1, aimY: 0, manualAim: false,
      weapons: [], skills: {}, st: computeStats({}),
      picks: 0, choices: [],
      downed: false, reviveT: 0,
      connected: true, lastSeq: 0,
      regenAcc: 0, orbHits: new Map(),
      kills: 0, dmg: 0, buildVer: 1,
    };
    p.px = p.x; p.py = p.y;
    p.hp = p.st.maxHp;
    if (this.wave === 0 && this.phase === 'pick') {
      p.picks = 1;
      p.choices = this.starterChoices();
    } else {
      // late joiner: starter weapon now, catch-up picks at the next intermission
      this.giveWeapon(p, 'kivilcim');
      p.catchUp = Math.max(0, this.level - 1);
      if (this.phase === 'pick') { p.picks = 1 + p.catchUp; p.catchUp = 0; p.choices = this.genChoices(p); }
    }
    this.players.push(p);
    return p;
  }

  playerByCid(cid) { return this.players.find((p) => p.cid === cid); }
  playerByPid(pid) { return this.players.find((p) => p.pid === pid); }

  setConnected(cid, on) {
    const p = this.playerByCid(cid);
    if (!p) return;
    p.connected = on;
    p.buildVer++;
    if (!on) this.checkGameOver();
  }

  removePlayer(cid) {
    this.players = this.players.filter((p) => p.cid !== cid);
    this.checkGameOver();
  }

  recalc(p) {
    const prevMax = p.st.maxHp;
    p.st = computeStats(p.skills);
    if (p.st.maxHp > prevMax) p.hp += p.st.maxHp - prevMax;
    p.hp = Math.min(p.hp, p.st.maxHp);
    p.buildVer++;
  }

  giveWeapon(p, id) {
    const owned = p.weapons.find((w) => w.id === id);
    if (owned) owned.tier = Math.min(MAX_TIER, owned.tier + 1);
    else if (p.weapons.length < MAX_WEAPONS) p.weapons.push({ id, tier: 1, cd: 10 + p.weapons.length * 7 });
    p.buildVer++;
  }

  starterChoices() {
    const pool = [...STARTER_WEAPONS];
    const out = [];
    while (out.length < 3 && pool.length) {
      const i = Math.floor(this.rng.next() * pool.length);
      out.push({ t: 'w', id: pool.splice(i, 1)[0] });
    }
    return out;
  }

  genChoices(p) {
    const pool = [];
    for (const id of WEAPON_IDS) {
      const owned = p.weapons.find((w) => w.id === id);
      if (owned && owned.tier < MAX_TIER) pool.push({ t: 'w', id, wt: 1.1 });
      else if (!owned && p.weapons.length < MAX_WEAPONS) pool.push({ t: 'w', id, wt: 0.55 });
    }
    for (const s of SKILLS) {
      if ((p.skills[s.id] || 0) < s.max) pool.push({ t: 's', id: s.id, wt: 1 });
    }
    const out = [];
    while (out.length < 3 && pool.length) {
      const c = this.rng.weighted(pool, (x) => x.wt);
      pool.splice(pool.indexOf(c), 1);
      out.push({ t: c.t, id: c.id });
    }
    return out;
  }

  choose(pid, index) {
    const p = this.playerByPid(pid);
    if (!p || p.picks <= 0 || this.phase !== 'pick') return false;
    const c = p.choices[index];
    if (!c) return false;
    if (c.t === 'w') this.giveWeapon(p, c.id);
    else {
      p.skills[c.id] = (p.skills[c.id] || 0) + 1;
      this.recalc(p);
      if (c.id === 'can') p.hp = p.st.maxHp;
    }
    p.picks--;
    p.choices = p.picks > 0 ? this.genChoices(p) : [];
    p.buildVer++;
    this.emit('pick', p.pid, c.t, c.id);
    return true;
  }

  // ------------------------------------------------------------- main step
  step(inputs) {
    this.tick++;
    if (this.phase === 'gameover' || this.phase === 'victory') return;

    for (const p of this.players) { p.px = p.x; p.py = p.y; }
    for (const e of this.enemies) { e.px = e.x; e.py = e.y; }
    for (const b of this.bullets) { b.px = b.x; b.py = b.y; }
    for (const b of this.ebullets) { b.px = b.x; b.py = b.y; }
    for (const k of this.pickups) { k.px = k.x; k.py = k.y; }

    this.grid.clear();
    for (const e of this.enemies) this.grid.insert(e);

    for (const p of this.players) this.stepPlayer(p, inputs.get(p.pid));

    if (this.phase === 'pick') this.stepPick();
    else if (this.phase === 'countdown') {
      if (--this.countdown <= 0) this.startWave();
    } else if (this.phase === 'wave') this.stepWave();

    this.stepTelegraphs();
    this.stepEnemies();
    this.stepBullets();
    this.stepEBullets();
    this.stepPickups();
    this.stepRevives();

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.ebullets = this.ebullets.filter((b) => !b.dead);
    this.pickups = this.pickups.filter((k) => !k.dead);
  }

  stepPlayer(p, input) {
    if (!input || !p.connected) input = { mx: 0, my: 0, ax: 0, ay: 0, dash: false };
    if (input.seq) p.lastSeq = input.seq;
    if (p.iframes > 0) p.iframes--;

    // aim: manual if provided, otherwise auto-aim at the nearest enemy
    const al = Math.hypot(input.ax || 0, input.ay || 0);
    p.manualAim = al > 0.2;
    if (p.manualAim) { p.aimX = input.ax / al; p.aimY = input.ay / al; }
    else if (!p.downed) {
      const t = this.nearestEnemy(p.x, p.y, 650);
      if (t) {
        const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
        p.aimX = dx / d; p.aimY = dy / d;
      } else {
        const ml = Math.hypot(input.mx || 0, input.my || 0);
        if (ml > 0.3) { p.aimX = input.mx / ml; p.aimY = input.my / ml; }
      }
    }

    const r = stepMovement(p, input, p.st.speed, dashCooldownTicks(p.st.dashCd));
    if (r === 1) {
      p.iframes = Math.max(p.iframes, DASH_TICKS + 5);
      this.emit('dash', p.pid, p.x, p.y, p.dashDx, p.dashDy);
    } else if (r === 2 && p.st.nova > 0) {
      this.nova(p);
    }
    if (p.downed) return;

    if (p.st.regen > 0 && p.hp < p.st.maxHp) {
      p.hp = Math.min(p.st.maxHp, p.hp + p.st.regen * DT);
    }

    if (this.phase === 'wave') {
      const canFire = this.enemies.length > 0 || p.manualAim;
      for (let i = 0; i < p.weapons.length; i++) {
        const w = p.weapons[i];
        if (w.cd > 0) w.cd--;
        if (w.cd <= 0 && canFire) {
          const ws = weaponStats(w.id, w.tier, p.st);
          if (this.fire(p, w, ws, i)) w.cd = Math.max(1, Math.round(ws.cooldown * TICK_RATE));
        }
      }
      if (p.st.orbitals > 0) this.stepOrbitals(p);
    }
  }

  // ---------------------------------------------------------------- combat
  muzzle(p, slot) {
    const n = p.weapons.length;
    const off = (slot - (n - 1) / 2) * 0.55;
    const a = Math.atan2(p.aimY, p.aimX) + off;
    return { x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24 };
  }

  fire(p, w, ws, slot) {
    const def = WEAPONS[w.id];
    const aim = Math.atan2(p.aimY, p.aimX);
    const m = this.muzzle(p, slot);
    const rng = this.rng;
    const dmg = ws.damage;

    switch (def.kind) {
      case 'bullet':
      case 'rocket':
      case 'flame':
      case 'homing':
      case 'boomerang': {
        const n = ws.count;
        const arc = n > 1 ? Math.max(def.arc || 0, 0.14 * (n - 1)) : 0;
        for (let i = 0; i < n; i++) {
          const a = aim + (n > 1 ? -arc / 2 + (arc * i) / (n - 1) : 0) + rng.range(-(def.spread || 0), def.spread || 0);
          const sp = ws.speed * (1 + rng.range(-(def.speedVar || 0), def.speedVar || 0));
          this.spawnBullet(p, w, def, a, sp, dmg, ws.range, m.x, m.y);
        }
        break;
      }
      case 'rail': {
        const n = ws.count;
        for (let i = 0; i < n; i++) {
          const a = aim + (n > 1 ? (i - (n - 1) / 2) * 0.12 : 0);
          this.rail(p, def, a, dmg, ws.range, m.x, m.y);
        }
        if (def.hitstop) this.emit('stop', def.hitstop * 0.5);
        break;
      }
      case 'arc': {
        if (!this.arc(p, def, aim, dmg, ws.range, def.chains + p.st.extraProj, m.x, m.y)) return false;
        break;
      }
    }
    this.emit('shoot', p.pid, w.id, m.x, m.y, aim);
    return true;
  }

  spawnBullet(p, w, def, a, sp, dmg, range, x, y) {
    const b = {
      id: this.id(), owner: p.pid, w: w.id, kind: def.kind,
      x, y, px: x, py: y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp,
      r: def.size, dmg, knock: def.knock,
      life: Math.round((range / Math.max(sp, 1)) * TICK_RATE),
      pierce: def.kind === 'bullet' || def.kind === 'homing' ? p.st.pierce : 0,
      ricochet: def.kind === 'bullet' ? p.st.ricochet : 0,
      hits: [], t: 0,
    };
    if (def.kind === 'flame') { b.pierce = 99; b.life = Math.round((range / sp) * TICK_RATE * 1.6); }
    if (def.kind === 'boomerang') { b.pierce = 999; b.out = Math.round((range / sp) * TICK_RATE * 1.4); b.life = b.out * 4; b.hitT = new Map(); }
    if (def.kind === 'rocket') b.life = Math.round((range / (sp * 1.8)) * TICK_RATE);
    this.bullets.push(b);
    return b;
  }

  rail(p, def, a, dmg, range, x, y) {
    const dx = Math.cos(a), dy = Math.sin(a);
    // clip beam to arena bounds
    let len = range;
    if (dx > 0) len = Math.min(len, (ARENA_W - x) / dx); else if (dx < 0) len = Math.min(len, -x / dx);
    if (dy > 0) len = Math.min(len, (ARENA_H - y) / dy); else if (dy < 0) len = Math.min(len, -y / dy);
    const hw = def.width / 2;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ex = e.x - x, ey = e.y - y;
      const along = ex * dx + ey * dy;
      if (along < -e.r || along > len + e.r) continue;
      const perp = Math.abs(ex * dy - ey * dx);
      if (perp < hw + e.r) this.damageEnemy(e, dmg, p, dx * def.knock, dy * def.knock);
    }
    this.emit('beam', x, y, x + dx * len, y + dy * len, p.pid);
  }

  arc(p, def, aim, dmg, range, chains, x, y) {
    // pick the enemy that best matches aim direction and distance
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > range + e.r) continue;
      let da = Math.abs(Math.atan2(dy, dx) - aim);
      if (da > Math.PI) da = TAU - da;
      if (p.manualAim && da > 0.9) continue;
      const s = d * (1 + da * 1.6);
      if (s < bestScore) { bestScore = s; best = e; }
    }
    if (!best) return false;
    const pts = [Math.round(x), Math.round(y)];
    const hit = new Set();
    let cur = best;
    let dd = dmg;
    for (let i = 0; i <= chains && cur; i++) {
      hit.add(cur.id);
      pts.push(Math.round(cur.x), Math.round(cur.y));
      const px = cur.x, py = cur.y;
      this.damageEnemy(cur, dd, p, 0, 0);
      dd *= 0.85;
      let next = null, nd = def.chainR;
      this.grid.query(px, py, def.chainR, (e) => {
        if (e.dead || hit.has(e.id)) return;
        const d = Math.hypot(e.x - px, e.y - py);
        if (d < nd) { nd = d; next = e; }
      });
      cur = next;
    }
    this.emit('arc', p.pid, pts);
    return true;
  }

  stepOrbitals(p) {
    const n = p.st.orbitals;
    const base = this.tick * 0.075;
    const dmg = (7 + 2 * n) * p.st.damage;
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * TAU;
      const ox = p.x + Math.cos(a) * 64, oy = p.y + Math.sin(a) * 64;
      this.grid.query(ox, oy, 14, (e) => {
        if (e.dead) return;
        if (Math.hypot(e.x - ox, e.y - oy) > e.r + 12) return;
        const last = p.orbHits.get(e.id) || -999;
        if (this.tick - last < 18) return;
        p.orbHits.set(e.id, this.tick);
        const kx = e.x - p.x, ky = e.y - p.y, kd = Math.hypot(kx, ky) || 1;
        this.damageEnemy(e, dmg, p, (kx / kd) * 90, (ky / kd) * 90);
      });
    }
    if (this.tick % 300 === 0) p.orbHits.clear();
  }

  nova(p) {
    const n = p.st.nova;
    const r = 105 + 15 * n;
    const dmg = 16 * n * p.st.damage;
    this.grid.query(p.x, p.y, r, (e) => {
      if (e.dead) return;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < r + e.r) this.damageEnemy(e, dmg, p, (dx / d) * 260, (dy / d) * 260);
    });
    for (const b of this.ebullets) if (Math.hypot(b.x - p.x, b.y - p.y) < r * 0.7) b.dead = true;
    this.emit('nova', p.pid, p.x, p.y, r);
  }

  damageEnemy(e, dmg, p, kx, ky, extra) {
    if (e.dead) return;
    let crit = false;
    if (p && this.rng.next() < p.st.crit) { dmg *= 2.2; crit = true; }
    e.hp -= dmg;
    e.flash = 5;
    const mass = e.mass || 1;
    e.kx += kx / mass; e.ky += ky / mass;
    if (p) {
      p.dmg += dmg;
      if (p.st.lifesteal > 0 && !p.downed && this.rng.next() < p.st.lifesteal) {
        p.hp = Math.min(p.st.maxHp, p.hp + 1);
      }
      if (p.st.frost > 0) e.slow = 50 + 30 * p.st.frost;
    }
    if (extra && extra.burn) { e.burn = BURN_TICKS; e.burnDps = Math.max(e.burnDps || 0, extra.burn); e.burnOwner = p ? p.pid : -1; }
    this.emit('hit', Math.round(e.x), Math.round(e.y - e.r), Math.max(1, Math.round(dmg)), crit ? 1 : 0, p ? p.pid : -1);
    if (e.hp <= 0) this.killEnemy(e, p);
  }

  killEnemy(e, p) {
    if (e.dead) return;
    const def = ENEMIES[e.type];
    e.dead = true;
    this.kills++;
    if (p) p.kills++;
    this.emit('kill', Math.round(e.x), Math.round(e.y), e.type, e.r, e.elite ? 1 : 0);
    if (e.r >= 22 && !def.boss) this.emit('stop', 35);

    this.dropXp(e.x, e.y, def.xp * (e.elite ? 5 : 1));
    if (e.elite || this.rng.next() < 0.018) this.pickups.push(this.mkPickup(e.x, e.y, PICKUP.HEART));

    if (def.split) {
      for (let i = 0; i < 2; i++) {
        const c = this.spawnEnemy(def.split, e.x + (i ? 8 : -8), e.y, false);
        const a = this.rng.range(0, TAU);
        c.kx = Math.cos(a) * 220; c.ky = Math.sin(a) * 220;
      }
    }
    if (e.type === 'bombaci') this.explosion(e.x, e.y, 90, 0, { players: false, enemies: true, enemyDmg: 30, owner: p });
    else if (p && p.st.explodeOnKill > 0 && this.rng.next() < p.st.explodeOnKill) {
      this.explosion(e.x, e.y, 75, 0, { players: false, enemies: true, enemyDmg: 22 * p.st.damage, owner: p });
    }
    if (def.boss) this.onBossKilled(e);
  }

  explosion(x, y, r, dmg, o) {
    this.emit('boom', Math.round(x), Math.round(y), r);
    if (o.enemies) {
      this.grid.query(x, y, r, (e) => {
        if (e.dead) return;
        const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
        if (d < r + e.r) this.damageEnemy(e, o.enemyDmg, o.owner || null, (dx / d) * 200, (dy / d) * 200);
      });
    }
    if (o.players) {
      for (const p of this.players) {
        if (Math.hypot(p.x - x, p.y - y) < r + p.r) this.hurtPlayer(p, dmg);
      }
    }
  }

  dropXp(x, y, amount) {
    while (amount > 0) {
      const big = amount >= 5;
      const v = big ? 5 : 1;
      amount -= v;
      if (this.pickups.length > 260) {
        // too many gems on the floor: fold value into an existing one
        const k = this.pickups[(this.rng.next() * this.pickups.length) | 0];
        if (k.kind !== PICKUP.HEART) { k.v += v; k.kind = PICKUP.XP_BIG; continue; }
      }
      const k = this.mkPickup(x + this.rng.range(-10, 10), y + this.rng.range(-10, 10), big ? PICKUP.XP_BIG : PICKUP.XP);
      k.v = v;
      this.pickups.push(k);
    }
  }

  mkPickup(x, y, kind) {
    const a = this.rng.range(0, TAU), s = this.rng.range(40, 140);
    return { id: this.id(), kind, x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v: 1, target: -1 };
  }

  hurtPlayer(p, dmg) {
    if (p.downed || !p.connected || p.iframes > 0 || p.dashT > 0) return false;
    if (this.phase !== 'wave') return false;
    dmg *= 1 - p.st.armor;
    p.hp -= dmg;
    p.iframes = 48;
    this.emit('hurt', p.pid, Math.round(p.x), Math.round(p.y), Math.round(dmg));
    this.emit('stop', 70);
    if (p.hp <= 0) {
      p.hp = 0;
      p.downed = true;
      p.reviveT = 0;
      p.buildVer++;
      this.emit('down', p.pid, Math.round(p.x), Math.round(p.y));
      this.checkGameOver();
    }
    return true;
  }

  checkGameOver() {
    if (this.phase === 'gameover' || this.phase === 'victory') return;
    const active = this.players.filter((p) => p.connected);
    if (active.length === 0) return;
    if (active.every((p) => p.downed)) {
      this.phase = 'gameover';
      this.emit('gameover');
    }
  }

  stepRevives() {
    for (const p of this.players) {
      if (!p.downed) continue;
      let helper = false;
      for (const q of this.players) {
        if (q === p || q.downed || !q.connected) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < 56) { helper = true; break; }
      }
      p.reviveT = helper ? p.reviveT + 1 : Math.max(0, p.reviveT - 2);
      if (p.reviveT >= REVIVE_TICKS) this.revive(p, 0.4);
    }
  }

  revive(p, frac) {
    p.downed = false;
    p.reviveT = 0;
    p.hp = Math.max(1, p.st.maxHp * frac);
    p.iframes = 90;
    p.buildVer++;
    this.emit('revive', p.pid, Math.round(p.x), Math.round(p.y));
  }

  nearestEnemy(x, y, maxD) {
    let best = null, bd = maxD;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  nearestPlayer(x, y) {
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (p.downed || !p.connected) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // --------------------------------------------------------------- enemies
  addTelegraph(x, y, type, elite, dur = 50) {
    x = Math.max(30, Math.min(ARENA_W - 30, x));
    y = Math.max(30, Math.min(ARENA_H - 30, y));
    this.teles.push({ id: this.id(), x, y, type, elite, t: 0, dur });
  }

  spawnEnemy(type, x, y, elite) {
    const def = ENEMIES[type];
    const hs = hpScale(Math.max(1, this.wave), this.connectedCount());
    let hp = def.hp * hs;
    if (def.boss) hp = def.hp * (1 + (this.bossLevel() - 1) * 1.1) * (1 + 0.6 * (this.connectedCount() - 1));
    const e = {
      id: this.id(), type, x, y, px: x, py: y,
      vx: 0, vy: 0, kx: 0, ky: 0,
      r: def.r * (elite ? 1.3 : 1),
      hp: hp * (elite ? 3 : 1), maxHp: hp * (elite ? 3 : 1),
      dmg: def.dmg * dmgScale(Math.max(1, this.wave)) * (elite ? 1.4 : 1),
      speed: def.speed * (1 + 0.012 * this.wave) * (elite ? 0.9 : 1),
      mass: (def.mass || 1) * (elite ? 2 : 1),
      elite: !!elite, boss: !!def.boss,
      ang: 0, flash: 0, state: 0, st: 0,
      cd: this.rng.int(40, 140), slow: 0, burn: 0, burnDps: 0, burnOwner: -1,
    };
    const t = this.nearestPlayer(x, y);
    if (t) e.ang = Math.atan2(t.y - y, t.x - x);
    if (def.boss) {
      e.lvl = this.bossLevel();
      e.pat = -1; e.st = 90; e.charging = 0;
      this.bossId = e.id;
      this.emit('boss', e.id);
    }
    this.enemies.push(e);
    return e;
  }

  bossLevel() { return Math.max(1, Math.round(this.wave / 5)); }

  connectedCount() { return Math.max(1, this.players.filter((p) => p.connected).length); }

  stepTelegraphs() {
    for (const t of this.teles) {
      if (++t.t >= t.dur) {
        t.dead = true;
        this.spawnEnemy(t.type, t.x, t.y, t.elite);
        this.emit('spawn', Math.round(t.x), Math.round(t.y), t.type);
      }
    }
    this.teles = this.teles.filter((t) => !t.dead);
  }

  stepEnemies() {
    const grid = this.grid;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const def = ENEMIES[e.type];
      if (e.flash > 0) e.flash--;
      let sp = e.speed;
      if (e.slow > 0) { e.slow--; sp *= 0.6; }
      if (e.burn > 0) {
        e.burn--;
        if (e.burn % 15 === 0) {
          const owner = this.playerByPid(e.burnOwner);
          e.hp -= e.burnDps / 4;
          e.flash = 2;
          this.emit('burn', Math.round(e.x), Math.round(e.y));
          if (e.hp <= 0) { this.killEnemy(e, owner); continue; }
        }
      }
      const t = this.nearestPlayer(e.x, e.y);
      AI[def.ai](this, e, t, sp);
      if (e.dead) continue;

      e.x += (e.vx + e.kx) * DT;
      e.y += (e.vy + e.ky) * DT;
      e.kx *= 0.86; e.ky *= 0.86;

      // separation (soft) using the spatial grid
      if (!e.boss) {
        grid.query(e.x, e.y, e.r, (o) => {
          if (o === e || o.dead) return;
          const dx = e.x - o.x, dy = e.y - o.y;
          const rr = e.r + o.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) return;
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.5;
          const w = o.mass / (o.mass + e.mass);
          e.x += dx * push * w; e.y += dy * push * w;
        });
      }
      clampToArena(e);

      // contact damage
      for (const p of this.players) {
        if (p.downed || !p.connected) continue;
        const dx = p.x - e.x, dy = p.y - e.y;
        const rr = p.r + e.r - 3;
        if (dx * dx + dy * dy < rr * rr) {
          const hit = this.hurtPlayer(p, e.dmg);
          if (hit && e.type === 'bombaci') { e.state = 1; e.st = Math.min(e.st || 40, 6); }
        }
      }
    }
  }

  // --------------------------------------------------------------- bullets
  stepBullets() {
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.t++;
      const owner = this.playerByPid(b.owner);
      if (b.kind === 'flame') { b.vx *= 0.955; b.vy *= 0.955; b.r += 0.35; }
      else if (b.kind === 'rocket') {
        const s = Math.hypot(b.vx, b.vy) || 1;
        const ns = Math.min(b.sp * 2.6, s + WEAPONS.roket.accel * DT);
        b.vx = (b.vx / s) * ns; b.vy = (b.vy / s) * ns;
      } else if (b.kind === 'homing') {
        if (b.t % 8 === 1 || !b.tgt || b.tgt.dead) b.tgt = this.nearestEnemy(b.x, b.y, 380);
        if (b.tgt && b.t > 6) {
          const want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let d = want - cur;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          cur += Math.max(-1, Math.min(1, d)) * WEAPONS.avci.turn * DT;
          b.vx = Math.cos(cur) * b.sp; b.vy = Math.sin(cur) * b.sp;
        }
      } else if (b.kind === 'boomerang') {
        if (b.t < b.out) {
          const k = 1 - b.t / b.out;
          const s = Math.hypot(b.vx, b.vy) || 1;
          const ns = Math.max(60, b.sp * k);
          b.vx = (b.vx / s) * ns; b.vy = (b.vy / s) * ns;
        } else if (owner) {
          const dx = owner.x - b.x, dy = owner.y - b.y, d = Math.hypot(dx, dy) || 1;
          const ns = Math.min(b.sp * 1.3, 80 + (b.t - b.out) * 22);
          b.vx = (dx / d) * ns; b.vy = (dy / d) * ns;
          if (d < 22) { b.dead = true; continue; }
        } else { b.dead = true; continue; }
      }

      b.x += b.vx * DT;
      b.y += b.vy * DT;

      if (--b.life <= 0 || b.x < -40 || b.y < -40 || b.x > ARENA_W + 40 || b.y > ARENA_H + 40) {
        if (b.kind === 'rocket') this.rocketBoom(b, owner);
        b.dead = true;
        continue;
      }

      // collision
      this.grid.query(b.x, b.y, b.r, (e) => {
        if (e.dead || b.dead) return;
        const dx = e.x - b.x, dy = e.y - b.y;
        const rr = e.r + b.r;
        if (dx * dx + dy * dy > rr * rr) return;
        if (b.kind === 'boomerang') {
          const last = b.hitT.get(e.id);
          if (last !== undefined && b.t - last < 14) return;
          b.hitT.set(e.id, b.t);
        } else if (b.hits.includes(e.id)) return;
        else b.hits.push(e.id);

        const s = Math.hypot(b.vx, b.vy) || 1;
        const kx = (b.vx / s) * b.knock, ky = (b.vy / s) * b.knock;
        if (b.kind === 'rocket') {
          this.damageEnemy(e, b.dmg, owner, kx, ky);
          this.rocketBoom(b, owner);
          b.dead = true;
          return true;
        }
        this.damageEnemy(e, b.dmg, owner, kx, ky, b.kind === 'flame' ? { burn: WEAPONS.alev.burn * (owner ? owner.st.damage : 1) } : null);
        if (b.kind === 'flame' || b.kind === 'boomerang') return;
        if (b.pierce > 0) { b.pierce--; return; }
        if (b.ricochet > 0) {
          b.ricochet--;
          let next = null, nd = 260;
          for (const o of this.enemies) {
            if (o.dead || b.hits.includes(o.id)) continue;
            const d = Math.hypot(o.x - b.x, o.y - b.y);
            if (d < nd) { nd = d; next = o; }
          }
          if (next) {
            const a = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s;
            b.life = Math.max(b.life, 30);
            return true;
          }
        }
        b.dead = true;
        return true;
      });
    }
  }

  rocketBoom(b, owner) {
    const def = WEAPONS.roket;
    const tier = owner ? (owner.weapons.find((w) => w.id === 'roket') || { tier: 1 }).tier : 1;
    const dmg = def.splash * (1 + 0.45 * (tier - 1)) * (owner ? owner.st.damage : 1);
    this.explosion(b.x, b.y, def.splashR, 0, { players: false, enemies: true, enemyDmg: dmg, owner });
  }

  spawnEBullet(x, y, a, sp, r, dmg, style) {
    if (this.ebullets.length > 600) return;
    this.ebullets.push({
      id: this.id(), x, y, px: x, py: y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r, dmg: dmg * dmgScale(Math.max(1, this.wave)) * 0.8, style, life: 9 * TICK_RATE,
    });
  }

  stepEBullets() {
    for (const b of this.ebullets) {
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      if (--b.life <= 0 || b.x < -20 || b.y < -20 || b.x > ARENA_W + 20 || b.y > ARENA_H + 20) { b.dead = true; continue; }
      for (const p of this.players) {
        if (p.downed || !p.connected) continue;
        const dx = p.x - b.x, dy = p.y - b.y;
        const rr = p.r * 0.7 + b.r; // forgiving hitbox: bullet hell convention
        if (dx * dx + dy * dy < rr * rr) {
          if (this.hurtPlayer(p, b.dmg)) { b.dead = true; this.emit('ebhit', Math.round(b.x), Math.round(b.y)); }
          break;
        }
      }
    }
  }

  // --------------------------------------------------------------- pickups
  stepPickups() {
    for (const k of this.pickups) {
      k.vx *= 0.9; k.vy *= 0.9;
      let best = null, bd = Infinity;
      for (const p of this.players) {
        if (p.downed || !p.connected) continue;
        const d = Math.hypot(p.x - k.x, p.y - k.y);
        const reach = this.phase === 'wave' ? 85 * p.st.pickup : 5000;
        if (d < reach && d < bd) { bd = d; best = p; }
      }
      if (best) {
        const dx = best.x - k.x, dy = best.y - k.y, d = bd || 1;
        const s = 260 + Math.max(0, 600 - d) * 0.9;
        k.vx += ((dx / d) * s - k.vx) * 0.25;
        k.vy += ((dy / d) * s - k.vy) * 0.25;
        if (d < best.r + 8) { this.collect(best, k); continue; }
      }
      k.x += k.vx * DT;
      k.y += k.vy * DT;
      k.x = Math.max(8, Math.min(ARENA_W - 8, k.x));
      k.y = Math.max(8, Math.min(ARENA_H - 8, k.y));
    }
  }

  collect(p, k) {
    k.dead = true;
    if (k.kind === PICKUP.HEART) {
      p.hp = Math.min(p.st.maxHp, p.hp + 20);
      this.emit('heal', p.pid, Math.round(p.x), Math.round(p.y));
      return;
    }
    this.gainXp(k.v);
    this.emit('xp', p.pid);
  }

  gainXp(v) {
    this.xp += v;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.levelsThisWave++;
      this.xpNext = xpForLevel(this.level);
      this.emit('levelup', this.level);
    }
  }

  // ----------------------------------------------------------------- waves
  stepPick() {
    if (this.assignPending) {
      if (--this.pickDelay > 0 && this.pickups.length > 0) return;
      for (const k of this.pickups) {
        if (k.kind !== PICKUP.HEART) this.gainXp(k.v);
        k.dead = true;
      }
      const base = Math.max(1, this.levelsThisWave);
      this.levelsThisWave = 0;
      this.assignPending = false;
      this.pickTimer = PICK_TIMEOUT;
      for (const p of this.players) {
        p.picks = base + (p.catchUp || 0);
        p.catchUp = 0;
        p.choices = this.genChoices(p);
        p.buildVer++;
      }
      return;
    }
    const waiting = this.players.filter((p) => p.connected && p.picks > 0);
    if (--this.pickTimer <= 0) {
      for (const p of waiting) while (p.picks > 0) this.choose(p.pid, 0);
    }
    if (waiting.length === 0 || this.pickTimer <= 0) {
      this.phase = 'countdown';
      this.countdown = Math.round(2.2 * TICK_RATE);
      this.emit('countdown', this.wave + 1);
    }
  }

  startWave() {
    this.wave++;
    this.phase = 'wave';
    this.levelsThisWave = 0;
    this.spawnAcc = 0;
    this.hordeDone = false;
    const boss = isBossWave(this.wave);
    this.waveTicks = boss ? 0 : waveDuration(this.wave);
    this.waveLen = this.waveTicks;
    for (const p of this.players) {
      if (p.downed) this.revive(p, 1);
      p.hp = p.st.maxHp;
      for (const w of p.weapons) w.cd = Math.min(w.cd, 20);
    }
    this.emit('wave', this.wave, boss ? 1 : 0);
    if (boss) {
      const c = this.farPoint(420);
      this.addTelegraph(c.x, c.y, 'gozcu', false, 110);
    } else {
      // opening pack so the arena is never empty
      const n = 3 + Math.floor(this.wave / 2);
      for (let i = 0; i < n; i++) this.spawnFromPool();
    }
  }

  farPoint(minD) {
    let pt = { x: ARENA_W / 2, y: ARENA_H / 2 };
    for (let i = 0; i < 20; i++) {
      const x = this.rng.range(80, ARENA_W - 80), y = this.rng.range(80, ARENA_H - 80);
      const t = this.nearestPlayer(x, y);
      pt = { x, y };
      if (!t || Math.hypot(t.x - x, t.y - y) > minD) break;
    }
    return pt;
  }

  spawnFromPool() {
    const pool = poolFor(this.wave);
    const c = this.rng.weighted(pool, (x) => x.weight);
    const pt = this.farPoint(240);
    const elite = c.group === 1 && this.rng.next() < eliteChance(this.wave);
    const n = c.group > 1 ? c.group + Math.floor(this.wave / 4) : 1;
    for (let i = 0; i < n; i++) {
      this.addTelegraph(pt.x + (n > 1 ? this.rng.range(-55, 55) : 0), pt.y + (n > 1 ? this.rng.range(-55, 55) : 0), c.type, elite);
    }
  }

  stepWave() {
    const boss = isBossWave(this.wave);
    const cap = 120 + 25 * (this.connectedCount() - 1);
    if (this.enemies.length + this.teles.length < cap) {
      const ramp = boss ? 1 : 0.6 + 0.8 * (1 - this.waveTicks / this.waveLen);
      this.spawnAcc += spawnRate(this.wave, boss) * ramp * (1 + 0.5 * (this.connectedCount() - 1)) * DT;
      while (this.spawnAcc >= 1) { this.spawnAcc--; this.spawnFromPool(); }
    }
    if (!boss) {
      // mid-wave horde: a ring of enemies closes in around a random player
      if (!this.hordeDone && this.wave >= 3 && this.waveTicks < this.waveLen * 0.45) {
        this.hordeDone = true;
        const t = this.nearestPlayer(this.rng.range(0, ARENA_W), this.rng.range(0, ARENA_H));
        if (t) {
          const n = 10 + this.wave;
          const type = this.wave >= 7 && this.rng.chance(0.5) ? 'yavru' : 'sinek';
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            this.addTelegraph(t.x + Math.cos(a) * 330, t.y + Math.sin(a) * 330, type, false, 70);
          }
          this.emit('horde');
        }
      }
      if (--this.waveTicks <= 0) this.endWave();
    }
  }

  onBossKilled(e) {
    this.emit('bossdead', Math.round(e.x), Math.round(e.y));
    this.emit('stop', 260);
    this.bossId = 0;
    this.dropXp(e.x, e.y, 30 + 15 * (e.lvl || 1));
    if (this.wave >= FINAL_WAVE) {
      this.phase = 'victory';
      this.emit('victory');
      return;
    }
    this.endWave();
  }

  endWave() {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.dead = true;
      this.emit('kill', Math.round(e.x), Math.round(e.y), e.type, e.r, 0);
    }
    for (const b of this.ebullets) b.dead = true;
    this.teles = [];
    for (const b of this.bullets) if (b.kind !== 'boomerang') b.dead = true;
    this.phase = 'pick';
    this.pickTimer = PICK_TIMEOUT;
    for (const p of this.players) {
      if (p.downed) this.revive(p, 1);
    }
    this.emit('waveend', this.wave);
    // gems on the floor fly to the players first; picks are assigned afterwards
    this.assignPending = true;
    this.pickDelay = 50;
    for (const p of this.players) { p.picks = 0; p.choices = []; }
  }
}

