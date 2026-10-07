// Data-driven weapon definitions.
// To add a weapon: add an entry here. `kind` selects the firing behaviour in
// sim/combat.js (bullet | rail | rocket | boomerang | arc | flame | homing).
// All numbers are tier-1 values; tiers scale damage and cooldown (see weaponStats).

export const WEAPONS = {
  kivilcim: {
    name: 'Kıvılcım', desc: 'Dengeli, hızlı enerji mermileri.',
    color: '#6ff3ff', kind: 'bullet', sfx: 'blaster', starter: true,
    cooldown: 0.30, damage: 11, speed: 780, range: 560, count: 1, spread: 0.05,
    size: 5, knock: 70, shake: 0.07,
  },
  sacma: {
    name: 'Saçma', desc: 'Yakında yıkıcı saçma; düşmanları geri savurur.',
    color: '#ffb347', kind: 'bullet', sfx: 'shotgun', starter: true,
    cooldown: 0.85, damage: 8, speed: 820, speedVar: 0.18, range: 330, count: 7,
    arc: 0.55, spread: 0.05, size: 4, knock: 230, shake: 0.28,
  },
  igne: {
    name: 'İğne Yağmuru', desc: 'Durmaksızın yağan, düşük hasarlı iğneler.',
    color: '#b6ff5c', kind: 'bullet', sfx: 'needle', starter: true,
    cooldown: 0.075, damage: 3.6, speed: 920, range: 480, count: 1, spread: 0.17,
    size: 3, knock: 18, shake: 0.025,
  },
  ray: {
    name: 'Ray Topu', desc: 'Her şeyi delip geçen anlık ışın. Yavaş ama ölümcül.',
    color: '#c08bff', kind: 'rail', sfx: 'rail',
    cooldown: 1.25, damage: 70, range: 950, width: 16, knock: 170, shake: 0.45, hitstop: 40,
  },
  roket: {
    name: 'Roketatar', desc: 'Çarpınca patlayan, hızlanan roketler.',
    color: '#ff6b3d', kind: 'rocket', sfx: 'rocket',
    cooldown: 0.95, damage: 16, splash: 34, splashR: 88, speed: 360, accel: 1100,
    range: 650, count: 1, spread: 0.04, size: 7, knock: 60, shake: 0.18,
  },
  bumerang: {
    name: 'Ay Bıçağı', desc: 'Delip geçen ve sahibine dönen bıçak.',
    color: '#e0f0ff', kind: 'boomerang', sfx: 'boomerang', starter: true,
    cooldown: 0.75, damage: 15, speed: 760, range: 340, count: 1, arc: 0.3,
    size: 11, knock: 90, shake: 0.06,
  },
  simsek: {
    name: 'Şimşek', desc: 'Düşmandan düşmana sıçrayan elektrik arkı.',
    color: '#7ab8ff', kind: 'arc', sfx: 'zap',
    cooldown: 0.5, damage: 13, range: 340, chains: 3, chainR: 175, knock: 30, shake: 0.1,
  },
  alev: {
    name: 'Ejder Nefesi', desc: 'Kısa menzilli alev seli; düşmanları tutuşturur.',
    color: '#ff9a2e', kind: 'flame', sfx: 'flame',
    cooldown: 0.06, damage: 2.4, burn: 7, speed: 540, range: 240, count: 1,
    spread: 0.22, size: 9, knock: 6, shake: 0.012,
  },
  avci: {
    name: 'Avcı Sürüsü', desc: 'Hedef arayan mini füze sürüsü.',
    color: '#ff5ad1', kind: 'homing', sfx: 'homing',
    cooldown: 0.6, damage: 9, speed: 500, range: 900, count: 2, arc: 0.9, turn: 7,
    size: 5, knock: 40, shake: 0.05,
  },
  kesici: {
    name: 'Mızrak', desc: 'Kısa menzilli, önüne çıkan her şeyi delen mızrak.',
    color: '#ffd9a0', kind: 'bullet', sfx: 'spear', starter: true,
    cooldown: 0.6, damage: 24, speed: 1100, range: 270, count: 1, spread: 0.03,
    size: 9, knock: 160, shake: 0.1, pierce: 99,
  },
  zehir: {
    name: 'Zehir Oku', desc: 'Hedefi zamanla eriten zehirli ok.',
    color: '#8cff4a', kind: 'bullet', sfx: 'needle', starter: true,
    cooldown: 0.42, damage: 5, burn: 9, speed: 720, range: 540, count: 1, spread: 0.06,
    size: 5, knock: 20, shake: 0.03,
  },
  buz: {
    name: 'Buz Kıymığı', desc: 'Üçlü buz kıymığı; vurduklarını yavaşlatır.',
    color: '#9fe8ff', kind: 'bullet', sfx: 'ice',
    cooldown: 0.7, damage: 7, frost: 100, speed: 700, range: 430, count: 3, arc: 0.5, spread: 0.04,
    size: 5, knock: 40, shake: 0.05,
  },
  ziplayan: {
    name: 'Sekiş Topu', desc: 'Düşmandan düşmana sekip duran enerji topu.',
    color: '#ffe14d', kind: 'bullet', sfx: 'blaster', starter: true,
    cooldown: 0.65, damage: 11, bounce: 4, speed: 560, range: 440, count: 1, spread: 0.04,
    size: 7, knock: 50, shake: 0.06,
  },
  agir: {
    name: 'Ağır Top', desc: 'Yavaş, devasa, ezici bir gülle.',
    color: '#ff8a6b', kind: 'bullet', sfx: 'cannon',
    cooldown: 1.5, damage: 70, speed: 360, range: 540, count: 1, spread: 0.02,
    size: 17, knock: 320, shake: 0.35, pierce: 2,
  },
  yildirim: {
    name: 'Yıldırım', desc: 'Gökten rastgele düşmanların başına yıldırım indirir.',
    color: '#fff27a', kind: 'smite', quiet: true,
    cooldown: 0.8, damage: 28, range: 540, count: 1, splashR: 80, knock: 120, shake: 0.12,
  },
  meteor: {
    name: 'Meteor Yağmuru', desc: 'Gecikmeli, geniş alanlı meteorlar çağırır.',
    color: '#ff7a3d', kind: 'meteor', quiet: true,
    cooldown: 1.7, damage: 46, range: 560, count: 2, splashR: 105, delay: 0.75, knock: 220, shake: 0.2,
  },
  mayin: {
    name: 'Mayın', desc: 'Yere mayın bırakır; yaklaşan düşmanla patlar.',
    color: '#b3ff3a', kind: 'mine', quiet: true,
    cooldown: 1.1, damage: 48, count: 1, splashR: 95, life: 7, knock: 200, shake: 0.05,
  },
  kor: {
    name: 'Kor Halkası', desc: 'Etrafındaki herkesi sürekli yakan ateş halkası.',
    color: '#ff6b9e', kind: 'aura', quiet: true,
    cooldown: 0.3, damage: 5, radius: 125, knock: 30, shake: 0,
  },
  sarsinti: {
    name: 'Yer Sarsıntısı', desc: 'Çevrene şok dalgası yollar, düşmanları savurur.',
    color: '#d6a86b', kind: 'pulse', quiet: true,
    cooldown: 2.0, damage: 30, radius: 200, knock: 420, shake: 0.3,
  },
  cift: {
    name: 'Çift Kama', desc: 'İki yana fırlayıp geri dönen kama.',
    color: '#bfe3ff', kind: 'boomerang', sfx: 'boomerang',
    cooldown: 1.0, damage: 13, speed: 700, range: 300, count: 2, arc: 3.14, size: 11, knock: 100, shake: 0.06,
  },
  prizma: {
    name: 'Prizma', desc: 'Üç ışına bölünen kırılmış ışın.',
    color: '#7af0ff', kind: 'rail', sfx: 'rail',
    cooldown: 1.1, damage: 26, range: 620, count: 3, width: 11, knock: 90, shake: 0.25,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);
export const WEAPON_INDEX = Object.fromEntries(WEAPON_IDS.map((id, i) => [id, i]));
export const STARTER_WEAPONS = WEAPON_IDS.filter((id) => WEAPONS[id].starter);
export const MAX_TIER = 4;
export const TIER_NAMES = ['', 'I', 'II', 'III', 'IV'];

// Effective numbers for a weapon at a tier, combined with a player's stats.
export function weaponStats(id, tier, st) {
  const w = WEAPONS[id];
  const t = tier - 1;
  return {
    damage: w.damage * (1 + 0.45 * t) * st.damage,
    cooldown: (w.cooldown * (1 - 0.08 * t)) / st.fireRate,
    speed: (w.speed || 0) * st.projSpeed,
    range: w.range * st.range,
    count: (w.count || 1) + st.extraProj,
    radius: (w.radius || 0) * (1 + 0.12 * t) * st.area,
    splashR: (w.splashR || 0) * (1 + 0.06 * t) * st.area,
  };
}

export function auraRadius(id, tier, st) {
  return (WEAPONS[id].radius || 0) * (1 + 0.12 * (tier - 1)) * (st.area || 1);
}
