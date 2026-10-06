// Wave director data. Pure data + small helpers; the Sim drives it.
import { TICK_RATE, BOSS_WAVES, FINAL_WAVE } from '../config.js';

// type -> [first wave, weight, group size]
export const SPAWN_TABLE = {
  surungen: [1, 10, 1],
  sinek:    [2, 5, 5],
  tukurgen: [2, 4, 1],
  kaya:     [3, 2.5, 1],
  bombaci:  [4, 3, 1],
  ok:       [6, 3.5, 1],
  bolunen:  [7, 3, 1],
  firildak: [8, 2.5, 1],
};

export function isBossWave(w) { return BOSS_WAVES.includes(w); }
export function isFinalWave(w) { return w >= FINAL_WAVE; }

export function waveDuration(w) {
  return Math.round(Math.min(18 + w * 3, 55) * TICK_RATE);
}

// enemies spawned per second (before player-count scaling)
export function spawnRate(w, boss) {
  const r = 0.85 + w * 0.3;
  return boss ? r * 0.35 : r;
}

export function hpScale(w, players) {
  return (1 + 0.17 * (w - 1) + 0.008 * (w - 1) * (w - 1)) * (1 + 0.45 * (players - 1));
}

export function dmgScale(w) {
  return 1 + 0.07 * (w - 1);
}

export function eliteChance(w) {
  return w >= 6 ? 0.025 + 0.004 * w : 0;
}

export function xpForLevel(lvl) {
  return Math.round(8 + lvl * 5 + lvl * lvl * 0.6);
}

export function poolFor(w) {
  const out = [];
  for (const type in SPAWN_TABLE) {
    const [from, weight, group] = SPAWN_TABLE[type];
    if (w >= from) out.push({ type, weight: weight * (w - from < 2 ? 0.6 : 1), group });
  }
  return out;
}
