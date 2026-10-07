// Map + structure tests (headless).
// Usage: node tools/maptest.mjs
import { genMap, POI_DEFS } from '../src/sim/map.js';
import { Sim } from '../src/sim/world.js';
import { hashSeed } from '../src/rng.js';
import { ARENA_W, ARENA_H } from '../src/config.js';

let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } };

// 1) generation: reachability, clearance, determinism
const CELL = 40, GW = Math.ceil(ARENA_W / CELL), GH = Math.ceil(ARENA_H / CELL);
for (let n = 0; n < 40; n++) {
  const seed = hashSeed('MAP' + n);
  const m = genMap(seed), m2 = genMap(seed);
  ok(JSON.stringify(m.obstacles) === JSON.stringify(m2.obstacles) && JSON.stringify(m.pois) === JSON.stringify(m2.pois), `deterministic ${n}`);
  const counts = {};
  for (const p of m.pois) counts[p.type + p.tier] = (counts[p.type + p.tier] || 0) + 1;
  ok(counts.chest1 === 3 && counts.shrine0 === 3 && counts.pylon0 === 2 && counts.fountain0 === 3 && counts.totem0 === 3 && counts.chest0 === 6, `poi counts ${n} ${JSON.stringify(counts)}`);
  // flood fill walkable cells (player radius 14) from the center
  const walk = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) walk[y * GW + x] = m.blocked(x * CELL + 20, y * CELL + 20, 14) ? 0 : 1;
  const seen = new Uint8Array(GW * GH);
  const st = [[(ARENA_W / 2 / CELL) | 0, (ARENA_H / 2 / CELL) | 0]];
  seen[st[0][1] * GW + st[0][0]] = 1;
  while (st.length) {
    const [x, y] = st.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || seen[ny * GW + nx] || !walk[ny * GW + nx]) continue;
      seen[ny * GW + nx] = 1; st.push([nx, ny]);
    }
  }
  for (const p of m.pois) ok(seen[((p.y / CELL) | 0) * GW + ((p.x / CELL) | 0)] === 1, `poi ${p.type} reachable (seed ${n})`);
  ok(!m.blocked(ARENA_W / 2, ARENA_H / 2, 100), `center clear ${n}`);
}

// 2) structures in a live sim
const sim = new Sim(hashSeed('POI'), 'POI');
const p = sim.addPlayer('a', 'A');
const inputs = new Map();
const events = [];
const run = (ticks) => { for (let i = 0; i < ticks; i++) { p.iframes = 1e9; sim.step(inputs); for (const e of sim.drainEvents()) events.push(e); } };
sim.choose(0, 0);
run(60 * 6);
ok(sim.phase === 'wave', 'wave started');
const at = (poi) => { p.x = poi.x; p.y = poi.y; p.vx = p.vy = 0; };
const byType = (t, tier = 0) => sim.pois.find((q) => q.type === t && q.tier === tier && !q.locked);

const chest = byType('chest');
const before = Object.values(p.skills).reduce((a, b) => a + b, 0) + p.weapons.reduce((a, w) => a + w.tier, 0);
at(chest); run(100);
const after = Object.values(p.skills).reduce((a, b) => a + b, 0) + p.weapons.reduce((a, w) => a + w.tier, 0);
ok(chest.state === 2 && after === before + 1, `chest gives 1 upgrade (${before}->${after}, state ${chest.state})`);

p.hp = 10;
const fountain = byType('fountain');
at(fountain); run(80);
ok(fountain.state === 2 && p.hp > 60, `fountain heals (hp ${p.hp})`);

const totem = byType('totem');
at(totem); run(100);
ok(totem.state === 2 && p.buffT > 0, 'totem buffs');

const shrine = byType('shrine');
at(shrine); run(130);
ok(shrine.state === 1 && shrine.total > 0, 'shrine ambush started');
const sk0 = Object.values(p.skills).reduce((a, b) => a + b, 0) + p.weapons.reduce((a, w) => a + w.tier, 0);
for (let i = 0; i < 60 * 40 && shrine.state === 1; i++) { run(1); for (const e of sim.enemies) if (e.poi === shrine.id) e.hp = 0, e.dead = true; }
ok(shrine.state === 2, 'shrine completes when ambush is dead');
const sk1 = Object.values(p.skills).reduce((a, b) => a + b, 0) + p.weapons.reduce((a, w) => a + w.tier, 0);
ok(sk1 === sk0 + 2, `shrine gives 2 upgrades (${sk0}->${sk1})`);

const pylon = byType('pylon');
at(pylon); run(100);
ok(pylon.state === 1, 'pylon charging');
const xp0 = sim.xp + sim.level * 1000;
run(1300);
ok(pylon.state === 2, `pylon completes (charge ${pylon.charge})`);

// guardian: asleep until near, locked chest opens after the kill
const gold = sim.pois.find((q) => q.tier === 1);
const g = sim.enemies.find((e) => e.id === gold.guard);
ok(g && g.asleep && gold.locked, 'guardian asleep, chest locked');
at(gold); p.x += 900; run(30);
ok(g.asleep, 'guardian stays asleep when far');
p.x = g.x + 400; p.y = g.y; run(5);
ok(!g.asleep, 'guardian wakes when a player approaches');
for (let i = 0; i < 600; i++) { run(1); }
ok(sim.ebullets.length > 0 || g.pt > 0, 'guardian attacks');
g.hp = 1; sim.damageEnemy(g, 50, p, 0, 0);
run(2);
ok(g.dead && !gold.locked, 'killing the guardian unlocks the gold chest');

// wave must be clearable while a guardian lives on
const sim2 = new Sim(hashSeed('W'), 'W');
const q = sim2.addPlayer('a', 'A');
sim2.choose(0, 0);
let ended = false;
for (let i = 0; i < 60 * 120 && !ended; i++) {
  q.iframes = 1e9;
  sim2.step(inputs);
  for (const ev of sim2.drainEvents()) if (ev[0] === 'waveend') ended = true;
  for (const e of sim2.enemies) if (!e.guardian && Math.hypot(e.x - q.x, e.y - q.y) < 900) { e.hp = 0; e.dead = true; }
  for (const e of sim2.enemies) if (!e.guardian) { e.x = q.x + 100; e.y = q.y; }
}
ok(ended, 'wave 1 can end while guardians sleep');
console.log(fail ? `${fail} FAILED` : 'all map tests passed');
process.exit(fail ? 1 : 0);
