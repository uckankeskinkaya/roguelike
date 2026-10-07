// Data-driven enemy definitions + behaviour (AI) functions.
// To add an enemy: add a definition (stats + `ai` key) and, if needed, a new AI
// function in AI. Spawn weights live in sim/waves.js.
import { DT, TICK_RATE, ARENA_W, ARENA_H } from '../config.js';

export const ENEMIES = {
  surungen: { name: 'Sürüngen', hp: 14, speed: 118, r: 12, dmg: 10, xp: 1, ai: 'chase', color: '#ff4d5e' },
  sinek:    { name: 'Sinek', hp: 5, speed: 172, r: 7, dmg: 6, xp: 1, ai: 'swarm', color: '#ff9f43' },
  tukurgen: { name: 'Tükürgen', hp: 22, speed: 92, r: 13, dmg: 8, xp: 2, ai: 'ranged', color: '#5dff8b' },
  kaya:     { name: 'Kaya', hp: 85, speed: 58, r: 26, dmg: 20, xp: 4, ai: 'charge', color: '#a66bff', mass: 4 },
  bombaci:  { name: 'Bombacı', hp: 18, speed: 145, r: 13, dmg: 26, xp: 2, ai: 'bomber', color: '#ff7a1a' },
  ok:       { name: 'Ok', hp: 20, speed: 72, r: 12, dmg: 14, xp: 2, ai: 'dash', color: '#ffe14d' },
  bolunen:  { name: 'Bölünen', hp: 42, speed: 80, r: 19, dmg: 12, xp: 2, ai: 'chase', split: 'yavru', color: '#ff6bd6', mass: 2 },
  yavru:    { name: 'Yavru', hp: 9, speed: 150, r: 10, dmg: 7, xp: 1, ai: 'chase', color: '#ffa3ea' },
  firildak: { name: 'Fırıldak', hp: 48, speed: 38, r: 18, dmg: 10, xp: 3, ai: 'turret', color: '#3ee6ff', mass: 3 },
  muhafiz:  { name: 'Muhafız', hp: 1100, speed: 55, r: 40, dmg: 22, xp: 28, ai: 'guardian', color: '#ffb13d', mass: 1000, guardian: true },
  gozcu:    { name: 'Kor Gözcü', hp: 2400, speed: 62, r: 56, dmg: 25, xp: 40, ai: 'boss', color: '#ff3355', mass: 1000, boss: true },
};

export const ENEMY_IDS = Object.keys(ENEMIES);
export const ENEMY_INDEX = Object.fromEntries(ENEMY_IDS.map((id, i) => [id, i]));

// Enemy bullet styles (render looks them up by index)
export const EB = { ORB: 0, SPIT: 1, RING: 2, BOSS: 3, BOSS2: 4 };

const TAU = Math.PI * 2;

function face(e, tx, ty, rate = 0.2) {
  const a = Math.atan2(ty - e.y, tx - e.x);
  let d = a - e.ang;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  e.ang += d * rate;
}

function moveToward(e, t, speed) {
  const dx = t.x - e.x, dy = t.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = (dx / d) * speed;
  e.vy = (dy / d) * speed;
  return d;
}

export const AI = {
  chase(sim, e, t, sp) {
    if (!t) { e.vx *= 0.9; e.vy *= 0.9; return; }
    moveToward(e, t, sp);
    face(e, t.x, t.y);
  },

  swarm(sim, e, t, sp) {
    if (!t) return;
    const d = moveToward(e, t, sp);
    const w = Math.sin(sim.tick * 0.12 + e.id * 1.7) * Math.min(1, d / 200) * sp * 0.8;
    e.vx += (-e.vy / sp) * w;
    e.vy += (e.vx / sp) * w;
    face(e, t.x, t.y, 0.3);
  },

  ranged(sim, e, t, sp) {
    if (!t) return;
    const dx = t.x - e.x, dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    face(e, t.x, t.y, 0.15);
    if (e.state === 1) { // wind-up before spitting
      e.vx *= 0.8; e.vy *= 0.8;
      if (--e.st <= 0) {
        const a = Math.atan2(dy, dx);
        const n = sim.wave >= 8 ? 3 : 1;
        for (let i = 0; i < n; i++) sim.spawnEBullet(e.x, e.y, a + (i - (n - 1) / 2) * 0.22, 230, 7, e.dmg, EB.SPIT);
        sim.emit('eshot', e.x, e.y);
        e.state = 0;
        e.cd = sim.rng.int(110, 160);
      }
      return;
    }
    const side = e.id % 2 ? 1 : -1;
    let vx, vy;
    if (d > 360) { vx = dx / d; vy = dy / d; }
    else if (d < 230) { vx = -dx / d; vy = -dy / d; }
    else { vx = (-dy / d) * side * 0.7; vy = (dx / d) * side * 0.7; }
    e.vx = vx * sp; e.vy = vy * sp;
    if (--e.cd <= 0 && d < 520) { e.state = 1; e.st = 22; }
  },

  turret(sim, e, t, sp) {
    e.ang += 0.03;
    if (t) {
      const d = moveToward(e, t, sp);
      if (d < 280) { e.vx *= -0.5; e.vy *= -0.5; }
    }
    if (--e.cd <= 0) {
      const n = 10 + Math.min(8, Math.floor(sim.wave / 2));
      const off = e.ang;
      for (let i = 0; i < n; i++) sim.spawnEBullet(e.x, e.y, off + (i / n) * TAU, 150, 7, e.dmg, EB.RING);
      sim.emit('eshot', e.x, e.y);
      e.cd = sim.rng.int(140, 180);
      e.flash = 4;
    }
  },

  charge(sim, e, t, sp) {
    if (e.state === 0) {
      if (!t) return;
      const d = moveToward(e, t, sp);
      face(e, t.x, t.y, 0.1);
      if (--e.cd <= 0 && d < 430) {
        e.state = 1; e.st = 42;
        e.ang = Math.atan2(t.y - e.y, t.x - e.x);
      }
    } else if (e.state === 1) {
      e.vx = 0; e.vy = 0;
      if (t) face(e, t.x, t.y, 0.05);
      if (--e.st <= 0) { e.state = 2; e.st = 32; sim.emit('charge', e.x, e.y); }
    } else {
      e.vx = Math.cos(e.ang) * 440;
      e.vy = Math.sin(e.ang) * 440;
      if (--e.st <= 0) { e.state = 0; e.cd = sim.rng.int(150, 230); }
    }
  },

  dash(sim, e, t, sp) {
    if (e.state === 0) {
      if (!t) return;
      const d = moveToward(e, t, sp);
      face(e, t.x, t.y, 0.2);
      if (--e.cd <= 0 && d < 400) { e.state = 1; e.st = 38; }
    } else if (e.state === 1) {
      e.vx *= 0.7; e.vy *= 0.7;
      if (t) face(e, t.x, t.y, 0.18);
      if (--e.st <= 0) { e.state = 2; e.st = 24; sim.emit('charge', e.x, e.y); }
    } else if (e.state === 2) {
      e.vx = Math.cos(e.ang) * 660;
      e.vy = Math.sin(e.ang) * 660;
      if (--e.st <= 0) { e.state = 3; e.st = 30; }
    } else {
      e.vx *= 0.85; e.vy *= 0.85;
      if (--e.st <= 0) { e.state = 0; e.cd = sim.rng.int(60, 120); }
    }
  },

  bomber(sim, e, t, sp) {
    if (e.state === 0) {
      if (!t) return;
      const d = moveToward(e, t, sp);
      face(e, t.x, t.y, 0.25);
      if (d < 58 + e.r) { e.state = 1; e.st = 40; sim.emit('fuse', e.x, e.y); }
    } else {
      e.vx *= 0.85; e.vy *= 0.85;
      if (--e.st <= 0) {
        e.hp = 0;
        e.dead = true;
        sim.explosion(e.x, e.y, 100, e.dmg, { players: true, enemies: true, enemyDmg: 30 });
      }
    }
  },

  boss(sim, e, t, sp) {
    bossAI(sim, e, t, sp);
  },

  // Map guardian: sleeps next to its treasure until a player gets close (or
  // shoots it), then fights with a boss pattern kit; goes back to sleep and
  // heals when everyone leaves.
  guardian(sim, e, t, sp) {
    const near = t ? Math.hypot(t.x - e.x, t.y - e.y) : 1e9;
    if (e.asleep) {
      const hx = e.hx - e.x, hy = e.hy - e.y, hd = Math.hypot(hx, hy);
      if (hd > 8) { e.vx = (hx / hd) * 180; e.vy = (hy / hd) * 180; } else { e.vx = 0; e.vy = 0; }
      if (near < 520) sim.wakeGuardian(e);
      return;
    }
    if (near > 1300) {
      if (++e.lose > 360) {
        e.asleep = true; e.hp = e.maxHp; e.state = 0; e.pat = -1; e.lose = 0; e.enraged = false; e.charging = 0;
        return;
      }
    } else e.lose = 0;
    bossAI(sim, e, near < 1300 ? t : null, sp);
    const hd = Math.hypot(e.x - e.hx, e.y - e.hy);
    if (hd > 900) { e.vx = ((e.hx - e.x) / hd) * sp * 2; e.vy = ((e.hy - e.y) / hd) * sp * 2; }
  },
};

// Pattern kits for the four guardian variants
export const GUARDIAN_KITS = [
  ['ring', 'charge', 'ring', 'aimed'],
  ['spiral', 'aimed', 'spiral', 'summon'],
  ['aimed', 'summon', 'ring', 'charge'],
  ['spiral', 'ring', 'charge', 'summon'],
];

// ---------------------------------------------------------------------------
// Boss: "Kor Gözcü" — a pattern state machine with an enraged second phase.
const BOSS_PATTERNS = ['spiral', 'ring', 'charge', 'aimed', 'summon', 'spiral', 'ring', 'aimed'];

function bossAI(sim, e, t, sp) {
  const enraged = e.hp < e.maxHp * 0.5;
  if (enraged && !e.enraged) {
    e.enraged = true;
    e.pat = -1; e.pt = 0; e.state = 0; e.st = 50;
    if (e.boss) {
      sim.emit('bossphase', e.x, e.y);
      sim.emit('stop', 160);
    } else sim.emit('ring', e.x, e.y, e.v);
    // clear some bullets to give the players a breather and a sense of impact
    for (const b of sim.ebullets) if (Math.hypot(b.x - e.x, b.y - e.y) < 260) b.dead = true;
  }
  const lvl = Math.min(e.lvl || 1, 4); // pattern density caps at the 4th boss; HP keeps scaling
  e.ang += enraged ? 0.025 : 0.012;

  if (e.state === 0) { // idle: drift toward target
    if (t) moveToward(e, t, sp * 0.8);
    if (--e.st <= 0) {
      const kit = e.kit || BOSS_PATTERNS;
      e.pat = (e.pat + 1) % kit.length;
      e.patName = kit[e.pat];
      e.state = 1; e.pt = 0;
      e.spin = sim.rng.range(0, TAU);
      e.dir = sim.rng.sign();
    }
    return;
  }

  const pat = e.patName;
  const pt = e.pt++;
  const cad = enraged ? 0.75 : 1;
  const done = (idle) => { e.state = 0; e.st = Math.round(idle * cad); };

  if (pat === 'spiral') {
    e.vx *= 0.9; e.vy *= 0.9;
    const arms = 3 + (enraged ? 2 : 0) + (lvl - 1);
    if (pt % 5 === 0) {
      e.spin += 0.17 * e.dir;
      for (let i = 0; i < arms; i++) sim.spawnEBullet(e.x, e.y, e.spin + (i / arms) * TAU, 175 + lvl * 10, 8, 12, EB.BOSS);
      if (pt % 15 === 0) sim.emit('eshot', e.x, e.y);
    }
    if (pt > 200) done(50);
  } else if (pat === 'ring') {
    e.vx *= 0.9; e.vy *= 0.9;
    if (pt % 34 === 0 && pt < 34 * (3 + lvl)) {
      const n = 26 + lvl * 4;
      const gap = sim.rng.int(0, n - 1);
      const off = sim.rng.range(0, TAU);
      for (let i = 0; i < n; i++) {
        if (Math.abs(i - gap) < 2) continue; // a gap to slip through
        const a = off + (i / n) * TAU;
        sim.spawnEBullet(e.x, e.y, a, 160, 9, 12, EB.BOSS2);
        if (enraged) sim.spawnEBullet(e.x, e.y, a + TAU / n / 2, 110, 7, 10, EB.BOSS);
      }
      sim.emit('eshot', e.x, e.y);
      e.flash = 5;
    }
    if (pt > 34 * (3 + lvl) + 20) done(50);
  } else if (pat === 'charge') {
    if (pt < 55) {
      e.vx = 0; e.vy = 0;
      if (t) e.cang = Math.atan2(t.y - e.y, t.x - e.x);
      e.charging = 1; // telegraph
    } else if (pt < 100) {
      if (pt === 55) sim.emit('charge', e.x, e.y);
      e.charging = 2;
      e.vx = Math.cos(e.cang) * 560;
      e.vy = Math.sin(e.cang) * 560;
      if (enraged && pt % 6 === 0) {
        sim.spawnEBullet(e.x, e.y, e.cang + Math.PI / 2, 90, 8, 10, EB.BOSS);
        sim.spawnEBullet(e.x, e.y, e.cang - Math.PI / 2, 90, 8, 10, EB.BOSS);
      }
    } else {
      e.charging = 0;
      e.vx *= 0.85; e.vy *= 0.85;
      if (pt > 120) {
        // second charge when enraged
        if (enraged && !e.secondCharge) { e.secondCharge = true; e.pt = 30; }
        else { e.secondCharge = false; done(55); }
      }
    }
  } else if (pat === 'aimed') {
    if (t) moveToward(e, t, sp * 0.4);
    if (pt % 26 === 0 && t) {
      const a = Math.atan2(t.y - e.y, t.x - e.x);
      const n = 5 + lvl + (enraged ? 2 : 0);
      for (let i = 0; i < n; i++) sim.spawnEBullet(e.x, e.y, a + (i - (n - 1) / 2) * 0.13, 260, 7, 11, EB.BOSS2);
      sim.emit('eshot', e.x, e.y);
      e.flash = 3;
    }
    if (pt > 26 * 5) done(45);
  } else if (pat === 'summon') {
    e.vx *= 0.9; e.vy *= 0.9;
    if (pt === 10) {
      const n = 4 + lvl * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const type = i % 3 === 0 && lvl > 1 ? 'ok' : 'surungen';
        sim.addTelegraph(e.x + Math.cos(a) * 140, e.y + Math.sin(a) * 140, type, false, 40);
      }
      sim.emit('summon', e.x, e.y);
    }
    if (pt > 60) done(40);
  }
}

// Clamp + resolve contact
export function clampToArena(e) {
  const r = e.r;
  if (e.x < r) e.x = r; else if (e.x > ARENA_W - r) e.x = ARENA_W - r;
  if (e.y < r) e.y = r; else if (e.y > ARENA_H - r) e.y = ARENA_H - r;
}

export const BURN_TICKS = 2 * TICK_RATE;
export { DT };
