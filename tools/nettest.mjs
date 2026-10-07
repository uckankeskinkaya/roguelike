// Snapshot round-trip + client prediction test (headless, no WebRTC).
import { Sim } from '../src/sim/world.js';
import { hashSeed } from '../src/rng.js';
import { encodeSnapshot, decodeSnapshot } from '../src/net/protocol.js';
import { ClientWorld } from '../src/net/clientworld.js';
import { buildInfo } from '../src/net/protocol.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const sim = new Sim(hashSeed('NET'), 'NET');
const p = sim.addPlayer('a', 'Ali');
sim.choose(0, 0);
const inputs = new Map();
const cw = new ClientWorld(0);
let now = 0;
let maxErr = 0;
for (let t = 0; t < 60 * 40; t++) {
  const a = t * 0.02;
  const input = { mx: Math.cos(a), my: Math.sin(a * 1.3), ax: 0, ay: 0, dash: t % 120 === 0, seq: t + 1 };
  inputs.set(0, input);
  sim.step(inputs);
  const ev = sim.drainEvents();
  now += 1000 / 60;
  // client predicts the same input locally (no latency in this test)
  if (cw.pred) cw.localTick({ ...input });
  else cw.seq = t + 1;
  if (t % 3 === 0) {
    const snap = decodeSnapshot(encodeSnapshot(sim, ev, true));
    ok(snap && snap.pois.length === sim.pois.length, 'poi count');
    cw.onSnapshot(snap, now);
    if (cw.pred) maxErr = Math.max(maxErr, Math.hypot(cw.pred.x - p.x, cw.pred.y - p.y));
  }
}
const snap = decodeSnapshot(encodeSnapshot(sim, [], true));
sim.pois.forEach((q, i) => {
  const d = snap.pois[i];
  ok(d.type === q.type && Math.abs(d.x - q.x) < 0.5 && d.state === q.state && !!d.locked === !!q.locked && d.tier === q.tier, `poi ${i} roundtrip`);
});
const g = sim.enemies.find((e) => e.guardian);
const gd = snap.enemies.find((e) => e.id === g.id);
ok(gd && gd.guardian && gd.asleep === g.asleep && gd.v === g.v, 'guardian roundtrip');
ok(cw.map && cw.map.obstacles.length === sim.map.obstacles.length, 'client map matches host map');
console.log('max prediction error (px):', maxErr.toFixed(2));
ok(maxErr < 3, 'prediction stays in sync, including obstacle collisions');
console.log(fail ? `${fail} FAILED` : 'net tests passed');
process.exit(fail ? 1 : 0);
