// Balance probe: a simple kiting bot (not invincible) plays many seeds.
// Usage: node tools/balance.mjs [runs] [players]
import { Sim } from '../src/sim/world.js';
import { hashSeed } from '../src/rng.js';
import { ARENA_W, ARENA_H } from '../src/config.js';

const runs = +(process.argv[2] || 10);
const nPlayers = +(process.argv[3] || 1);

function botInput(sim, p, t) {
  // repulsion from enemies and enemy bullets, weak pull to arena center
  let fx = (ARENA_W / 2 - p.x) * 0.0015, fy = (ARENA_H / 2 - p.y) * 0.0015;
  let danger = 0;
  for (const e of sim.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d < 260) { const w = (260 - d) / 260 * (1 + e.r / 20); fx += dx / d * w; fy += dy / d * w; }
    if (d < e.r + 40) danger++;
  }
  for (const b of sim.ebullets) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (d < 120) { const w = (120 - d) / 120 * 1.5; fx += dx / d * w; fy += dy / d * w; if (d < 40) danger++; }
  }
  const l = Math.hypot(fx, fy) || 1;
  return { mx: fx / l, my: fy / l, ax: 0, ay: 0, dash: danger > 0, seq: t };
}

const results = [];
for (let r = 0; r < runs; r++) {
  const seed = 'BAL' + r;
  const sim = new Sim(hashSeed(seed), seed);
  for (let i = 0; i < nPlayers; i++) sim.addPlayer('b' + i, 'B' + i);
  const inputs = new Map();
  const waveTimes = {};
  let t = 0;
  while (sim.phase !== 'gameover' && sim.phase !== 'victory' && t < 60 * 60 * 30) {
    for (const p of sim.players) {
      inputs.set(p.pid, botInput(sim, p, t));
      if (p.picks > 0 && sim.phase === 'pick') {
        // prefer weapon upgrades / damage
        const i = p.choices.findIndex((c) => c.t === 'w' || c.id === 'guc' || c.id === 'atis');
        sim.choose(p.pid, Math.max(0, i));
      }
    }
    const w = sim.wave;
    sim.step(inputs);
    sim.drainEvents();
    if (sim.wave !== w) waveTimes[sim.wave] = t;
    t++;
  }
  const bossWaves = [5, 10, 15].map((w) => waveTimes[w + 1] && waveTimes[w] ? Math.round((waveTimes[w + 1] - waveTimes[w]) / 60) : null);
  results.push({ seed, end: sim.phase, wave: sim.wave, lvl: sim.level, min: +(t / 3600).toFixed(1), bossSecs: bossWaves.join('/'), w: sim.players[0].weapons.map((x) => x.id + x.tier).join(',') });
}
console.table(results);
