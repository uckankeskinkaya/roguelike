// Wave director data. Pure data + small helpers; the Sim drives it.
import { BOSS_WAVES, FINAL_WAVE } from '../config.js';

// type -> [first wave, weight, group size]
export const SPAWN_TABLE = {
  surungen: [1, 10, 1],
  sinek:    [2, 5, 5],
  tukurgen: [3, 4, 1],
  kaya:     [4, 2.5, 1],
  bombaci:  [6, 3, 1],
  ok:       [8, 3.5, 1],
  bolunen:  [10, 3, 1],
  firildak: [13, 2.5, 1],
};

export function isBossWave(w) { return BOSS_WAVES.includes(w); }
export function isFinalWave(w) { return w >= FINAL_WAVE; }

// Team scaling. Enemy health grows a bit slower than head count so a bigger team
// is challenged without becoming a damage sponge race; enemy numbers and XP
// requirements scale together so everybody levels at the same pace.
export function teamHp(n) { return 1 + 0.85 * (n - 1); }
export function teamCount(n) { return 1 + 0.55 * (n - 1); }

// Waves have no timer: each one is a quota of enemies. It ends when the
// whole quota has spawned and been killed.
export function waveQuota(w) {
  return Math.round(20 + 4.2 * w + 0.06 * w * w);
}

// enemies spawned per second (before player-count scaling): a gentle ramp
export function spawnRate(w, boss) {
  const r = 1.0 + w * 0.05 + w * w * 0.0028;
  return boss ? r * 0.4 : r;
}

export function hpScale(w, players) {
  return (1.7 + 0.19 * (w - 1) + 0.026 * (w - 1) * (w - 1)) * teamHp(players);
}

export function dmgScale(w) {
  return 1.5 + 0.08 * (w - 1);
}

export function eliteChance(w) {
  return w >= 9 ? 0.03 + 0.004 * w : 0;
}

export function xpForLevel(lvl, players = 1) {
  return Math.round((8 + lvl * 5 + lvl * lvl * 0.6) * teamCount(players));
}

export function poolFor(w) {
  const out = [];
  for (const type in SPAWN_TABLE) {
    const [from, weight, group] = SPAWN_TABLE[type];
    if (w >= from) out.push({ type, weight: weight * (w - from < 2 ? 0.6 : 1), group });
  }
  return out;
}
