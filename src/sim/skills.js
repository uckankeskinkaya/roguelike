// Data-driven skills (passive upgrades). Each pick applies `mods` additively to
// the player's stats. To add a skill: add an entry; new stat keys need a default
// in BASE_STATS and a consumer in the simulation.

export const BASE_STATS = {
  maxHp: 100,
  speed: 1,          // movement multiplier (base 235 px/s)
  damage: 1,
  fireRate: 1,
  projSpeed: 1,
  range: 1,
  extraProj: 0,
  pierce: 0,
  crit: 0.05,
  lifesteal: 0,
  pickup: 1,         // pickup radius multiplier
  armor: 0,
  regen: 0,          // hp per second
  dashCd: 0,         // fractional cooldown reduction
  nova: 0,
  orbitals: 0,
  explodeOnKill: 0,
  ricochet: 0,
  frost: 0,
};

export const SKILLS = [
  { id: 'can', name: 'Demir Yürek', desc: '+20 maksimum can', icon: '♥', color: '#ff4d6d', max: 6, mods: { maxHp: 20 } },
  { id: 'hiz', name: 'Rüzgâr Adımı', desc: '+10% hareket hızı', icon: '»', color: '#7dff6a', max: 5, mods: { speed: 0.1 } },
  { id: 'guc', name: 'Öfke', desc: '+15% hasar', icon: '✸', color: '#ff8a3d', max: 8, mods: { damage: 0.15 } },
  { id: 'atis', name: 'Tetik Parmağı', desc: '+14% atış hızı', icon: '⁂', color: '#ffd23f', max: 8, mods: { fireRate: 0.14 } },
  { id: 'coklu', name: 'Çoğalma', desc: 'Silahlar +1 mermi atar, -8% hasar', icon: '⋔', color: '#4df0ff', max: 3, mods: { extraProj: 1, damage: -0.08 } },
  { id: 'delici', name: 'Delici Uç', desc: 'Mermiler +1 düşmanı deler', icon: '➶', color: '#c9d6ff', max: 3, mods: { pierce: 1 } },
  { id: 'kritik', name: 'Keskin Göz', desc: '+8% kritik vuruş şansı (x2.2 hasar)', icon: '◎', color: '#ffe066', max: 5, mods: { crit: 0.08 } },
  { id: 'vampir', name: 'Kan Emici', desc: 'Her vuruş %4 ihtimalle 1 can yeniler', icon: '♦', color: '#d1003f', max: 4, mods: { lifesteal: 0.04 } },
  { id: 'miknatis', name: 'Çekim Alanı', desc: '+50% toplama mesafesi', icon: '∪', color: '#5affc8', max: 4, mods: { pickup: 0.5 } },
  { id: 'zirh', name: 'Kabuk', desc: 'Alınan hasar -8%', icon: '⬢', color: '#9fb4d9', max: 5, mods: { armor: 0.08 } },
  { id: 'yenilen', name: 'Yenilenme', desc: 'Saniyede +0.6 can yenilenir', icon: '✚', color: '#8cff9e', max: 5, mods: { regen: 0.6 } },
  { id: 'atilim', name: 'Gölge Atılımı', desc: 'Atılma bekleme süresi -18%', icon: '⇢', color: '#a98bff', max: 4, mods: { dashCd: 0.18 } },
  { id: 'nova', name: 'Şok Dalgası', desc: 'Atılmanın sonunda çevreye şok dalgası', icon: '◌', color: '#7ab8ff', max: 4, mods: { nova: 1 } },
  { id: 'yorunge', name: 'Yörünge Bıçakları', desc: 'Etrafında dönen +1 bıçak', icon: '✦', color: '#e0f0ff', max: 4, mods: { orbitals: 1 } },
  { id: 'patlayici', name: 'Kor Ruhu', desc: 'Ölen düşmanlar %20 ihtimalle patlar', icon: '✺', color: '#ff6b3d', max: 3, mods: { explodeOnKill: 0.2 } },
  { id: 'sekme', name: 'Sekme', desc: 'İsabet eden mermiler yakındaki düşmana seker', icon: '↯', color: '#ffb347', max: 2, mods: { ricochet: 1 } },
  { id: 'buz', name: 'Ayaz', desc: 'İsabetler düşmanları yavaşlatır', icon: '❄', color: '#bfefff', max: 2, mods: { frost: 1 } },
  { id: 'menzil', name: 'Uzun Nişan', desc: '+20% mermi hızı ve menzil', icon: '⟶', color: '#c08bff', max: 4, mods: { projSpeed: 0.2, range: 0.2 } },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function computeStats(skills) {
  const st = { ...BASE_STATS };
  for (const id in skills) {
    const def = SKILL_BY_ID[id];
    if (!def) continue;
    const n = skills[id];
    for (const k in def.mods) st[k] += def.mods[k] * n;
  }
  st.armor = Math.min(st.armor, 0.6);
  st.dashCd = Math.min(st.dashCd, 0.6);
  st.damage = Math.max(st.damage, 0.3);
  return st;
}
