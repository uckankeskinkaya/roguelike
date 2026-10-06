// Wave director data. Pure data + small helpers; the Sim drives it.
import { BOSS_WAVES, FINAL_WAVE } from '../config.js';

// type -> [first wave, weight, group size]
export const SPAWN_TABLE = {
  surungen: [1, 10, 1],
  sinek:    [3, 5, 5],
  tukurgen: [4, 4, 1],
  kaya:     [6, 2.5, 1],
  bombaci:  [8, 3, 1],
  ok:       [11, 3.5, 1],
  bolunen:  [13, 3, 1],
  firildak: [16, 2.5, 1],
};

export function isBossWave(w) { return BOSS_WAVES.includes(w); }
export function isFinalWave(w) { return w >= FINAL_WAVE; }

// Waves have no timer: each one is a quota of enemies. It ends when the
// whole quota has spawned and been killed.
export function waveQuota(w) {
  return Math.round(14 + 4.2 * w + 0.06 * w * w);
}

// enemies spawned per second (before player-count scaling): a gentle ramp
export function spawnRate(w, boss) {
  const r = 0.4 + w * 0.04 + w * w * 0.0018;
  return boss ? r * 0.4 : r;
}

export function hpScale(w, players) {
  return (1 + 0.12 * (w - 1) + 0.012 * (w - 1) * (w - 1)) * (1 + 0.75 * (players - 1));
}

export function dmgScale(w) {
  return 1 + 0.055 * (w - 1);
}

export function eliteChance(w) {
  return w >= 9 ? 0.03 + 0.004 * w : 0;
}

export function xpForLevel(lvl, players = 1) {
  return Math.round((8 + lvl * 5 + lvl * lvl * 0.6) * (1 + 0.4 * (players - 1)));
}

export function poolFor(w) {
  const out = [];
  for (const type in SPAWN_TABLE) {
    const [from, weight, group] = SPAWN_TABLE[type];
    if (w >= from) out.push({ type, weight: weight * (w - from < 2 ? 0.6 : 1), group });
  }
  return out;
}
