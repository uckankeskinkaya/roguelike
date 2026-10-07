// Headless smoke test: runs the simulation with simple bots for many waves.
// Usage: node tools/simtest.mjs [players] [seed]
import { Sim } from '../src/sim/world.js';
import { hashSeed } from '../src/rng.js';

const nPlayers = +(process.argv[2] || 1);
const seed = process.argv[3] || 'TEST01';
const sim = new Sim(hashSeed(seed), seed);
for (let i = 0; i < nPlayers; i++) sim.addPlayer('bot' + i, 'Bot ' + i);
// bots are invincible so the test reaches the end of the run
for (const p of sim.players) p.iframes = 1e9;

const inputs = new Map();
let maxEnemies = 0, maxEB = 0, maxB = 0, evCount = 0;
const t0 = Date.now();
for (let t = 0; t < 60 * 60 * 60 && sim.phase !== 'victory' && sim.phase !== 'gameover'; t++) {
  for (const p of sim.players) {
    p.iframes = 1e9;
    const a = t * 0.01 + p.pid;
    inputs.set(p.pid, { mx: Math.cos(a), my: Math.sin(a * 1.3), ax: 0, ay: 0, dash: t % 90 === 0, seq: t });
    if (p.picks > 0) sim.choose(p.pid, t % 3);
  }
  sim.step(inputs);
  evCount += sim.drainEvents().length;
  maxEnemies = Math.max(maxEnemies, sim.enemies.length);
  maxEB = Math.max(maxEB, sim.ebullets.length);
  maxB = Math.max(maxB, sim.bullets.length);
  if (t % 3600 === 0) console.log(`t=${t / 60}s wave=${sim.wave} phase=${sim.phase} lvl=${sim.level} enemies=${sim.enemies.length} kills=${sim.kills} weapons=${sim.players[0].weapons.map(w=>w.id+w.tier).join(',')}`);
}
console.log({ phase: sim.phase, wave: sim.wave, level: sim.level, kills: sim.kills, maxEnemies, maxEB, maxB, evCount, ms: Date.now() - t0, ticks: sim.tick });
for (const p of sim.players) console.log(p.name, p.weapons.map(w=>w.id+w.tier).join(','), JSON.stringify(p.skills), 'dmg', Math.round(p.dmg));
