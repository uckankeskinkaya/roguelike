// Every weapon and every skill must run without errors and actually do something.
// Usage: node tools/weapontest.mjs
import { Sim } from '../src/sim/world.js';
import { hashSeed } from '../src/rng.js';
import { WEAPONS, WEAPON_IDS } from '../src/sim/weapons.js';
import { SKILLS } from '../src/sim/skills.js';
import { ENEMIES } from '../src/sim/enemies.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
console.log(`${WEAPON_IDS.length} weapons, ${SKILLS.length} skills`);
ok(WEAPON_IDS.length >= 20, 'at least 20 weapons');
ok(SKILLS.length >= 40, 'at least 40 skills');

function arena(setup) {
  const sim = new Sim(hashSeed('WT'), 'WT');
  const p = sim.addPlayer('a', 'A');
  sim.choose(0, 0);
  p.weapons = []; p.skills = {}; sim.recalc(p);
  p.iframes = 1e9;
  sim.phase = 'wave'; sim.wave = 3; sim.waveLen = 0; sim.waveSpawned = 1e9; sim.hordeDone = true;
  sim.guardsOff = true;
  for (const e of sim.enemies) e.dead = true; // remove guardians for isolation
  sim.enemies = [];
  setup(sim, p);
  return { sim, p };
}
const ring = (sim, p, n, rad, hp = 400) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const e = sim.spawnEnemy('surungen', p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad, false);
    e.hp = e.maxHp = hp; e.speed = 0;
  }
};
const totalHp = (sim) => sim.enemies.reduce((a, e) => a + e.hp, 0);

// every weapon, at every tier, damages enemies
for (const id of WEAPON_IDS) {
  for (const tier of [1, 4]) {
    const { sim, p } = arena((s, q) => { q.weapons.push({ id, tier, cd: 0 }); });
    ring(sim, p, 8, 45);
    const before = totalHp(sim);
    const inputs = new Map();
    let evts = 0;
    for (let t = 0; t < 60 * 6; t++) { p.iframes = 1e9; for (const e of sim.enemies) { e.vx = e.vy = 0; } sim.step(inputs); evts += sim.drainEvents().length; }
    ok(totalHp(sim) < before || sim.enemies.length < 8, `${id} tier ${tier} deals damage (${Math.round(before)} -> ${Math.round(totalHp(sim))})`);
    ok(Number.isFinite(p.x) && Number.isFinite(p.hp), `${id} no NaN`);
  }
}

// every skill: run a fight with it maxed, nothing explodes, the stat actually changes
for (const sk of SKILLS) {
  const { sim, p } = arena((s, q) => { q.weapons.push({ id: 'kivilcim', tier: 2, cd: 0 }, { id: 'sacma', tier: 1, cd: 0 }); q.skills[sk.id] = sk.max; s.recalc(q); });
  const base = arena(() => {}).p.st;
  const changed = Object.keys(sk.mods).some((k) => p.st[k] !== base[k]);
  ok(changed, `skill ${sk.id} changes stats`);
  for (let i = 0; i < 20; i++) sim.spawnEnemy(['surungen', 'kaya', 'sinek', 'bombaci'][i % 4], p.x + (i - 10) * 40, p.y + 160, i === 0);
  const inputs = new Map();
  for (let t = 0; t < 60 * 8; t++) {
    inputs.set(0, { mx: Math.cos(t * 0.03), my: Math.sin(t * 0.03), ax: 0, ay: 0, dash: t % 70 === 0, seq: t });
    if (t % 200 === 100) { p.iframes = 0; sim.hurtPlayer(p, 20); }
    sim.step(inputs); sim.drainEvents();
    while (p.picks > 0) sim.choose(0, 0);
  }
  ok(Number.isFinite(p.hp) && Number.isFinite(p.x), `skill ${sk.id} stable`);
}

// specific skill behaviours
{
  const { sim, p } = arena((s, q) => { q.skills.ikinci = 1; s.recalc(q); });
  p.iframes = 0; p.hp = 5; sim.hurtPlayer(p, 50);
  ok(!p.downed && p.hp > 40, 'İkinci Şans saves from a lethal hit');
  p.iframes = 0; p.hp = 5; sim.hurtPlayer(p, 50);
  ok(p.downed, 'only once');
}
{
  const { sim, p } = arena((s, q) => { q.skills.infaz = 3; s.recalc(q); q.weapons.push({ id: 'kivilcim', tier: 1, cd: 999 }); });
  ring(sim, p, 1, 60, 100);
  const e = sim.enemies[0]; e.hp = 15; sim.damageEnemy(e, 1, p, 0, 0);
  ok(e.dead, 'İnfaz executes low-hp enemies');
}
{
  const { sim, p } = arena((s, q) => { q.skills.kacin = 5; s.recalc(q); });
  let dodged = 0;
  for (let i = 0; i < 400; i++) { p.iframes = 0; p.hp = 100; if (!sim.hurtPlayer(p, 5)) dodged++; }
  ok(dodged > 60 && dodged < 260, `Hayalet Adımı dodges sometimes (${dodged}/400)`);
}
{
  const { sim, p } = arena((s, q) => { q.skills.yuva = 2; s.recalc(q); });
  for (const id of ['kivilcim', 'sacma', 'igne', 'bumerang', 'ray', 'roket']) sim.giveWeapon(p, id);
  ok(p.weapons.length === 6, `Ek Silah Yuvası allows 6 weapons (${p.weapons.length})`);
}

// co-op: picks are equal and simultaneous
{
  const sim = new Sim(hashSeed('COOP'), 'COOP');
  const ps = [0, 1, 2].map((i) => sim.addPlayer('p' + i, 'P' + i));
  for (const q of ps) sim.choose(q.pid, 0);
  sim.phase = 'wave'; sim.wave = 2;
  sim.gainXp(sim.xpNext);
  ok(ps.every((q) => q.picks === 1), 'level-up gives every player a pick');
  ok(sim.isFrozen(), 'and freezes the game');
  for (const q of ps) sim.choose(q.pid, 0);
  ok(!sim.isFrozen(), 'unfreezes after all chose');
  const chest = sim.pois.find((q) => q.type === 'chest' && !q.locked);
  sim.finishPoi(chest);
  ok(ps.every((q) => q.picks === 1), 'a chest gives every player the same picks');
  for (const q of ps) sim.choose(q.pid, 0);
  // offline player catches up
  sim.setConnected('p2', false);
  sim.gainXp(sim.xpNext); sim.gainXp(sim.xpNext);
  ok(ps[2].picks === 0 && ps[0].picks === 2, 'offline players are skipped');
  for (const q of [ps[0], ps[1]]) { sim.choose(q.pid, 0); sim.choose(q.pid, 0); }
  sim.setConnected('p2', true);
  ok(ps[2].picks === 2, `reconnecting player gets the missed level-ups (${ps[2].picks})`);
}
console.log(fail ? `${fail} FAILED` : 'all weapon/skill tests passed');
process.exit(fail ? 1 : 0);
