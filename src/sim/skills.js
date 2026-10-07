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
  dodge: 0,          // chance to ignore a hit
  thorns: 0,         // damage reflected to attackers
  execute: 0,        // instantly kill normal enemies below this hp fraction
  bossDmg: 0,        // bonus damage vs elites / bosses / guardians
  size: 1,           // projectile size
  knockMul: 1,
  critDmg: 2.2,      // crit multiplier
  xpMul: 1,
  heartDrop: 0,      // extra heart drop chance
  dashLen: 0,        // extra dash ticks
  dashHit: 0,        // damage dealt to enemies you dash through
  flatArmor: 0,      // damage removed from every hit
  rage: 0,           // bonus damage below 50% hp
  frenzy: 0,         // fire rate bonus for 2 s after a kill
  killHeal: 0,
  area: 1,           // explosion / aura / pulse size
  slots: 4,          // weapon slots
  seek: 0,           // projectile homing strength
  frag: 0,           // fragments (x2) spawned by a hit
  chill: 0,          // slows enemies near you
  secondWind: 0,     // lethal hits you survive per run
  bleed: 0,          // hits make enemies bleed
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
  { id: 'kacin', name: 'Hayalet Adımı', desc: '+7% ihtimalle gelen vuruşu yok say', icon: '≋', color: '#b9a8ff', max: 5, mods: { dodge: 0.07 } },
  { id: 'diken', name: 'Diken Zırhı', desc: 'Sana çarpan düşmana 12 hasar yansıt', icon: '✶', color: '#ff9f6b', max: 4, mods: { thorns: 12 } },
  { id: 'infaz', name: 'İnfaz', desc: 'Canı %7 altındaki düşmanlar anında ölür', icon: '☠', color: '#e8e8f2', max: 3, mods: { execute: 0.07 } },
  { id: 'avci', name: 'Av Avcısı', desc: 'Elit, boss ve Muhafızlara +20% hasar', icon: '♛', color: '#ffd23f', max: 4, mods: { bossDmg: 0.2 } },
  { id: 'kocaman', name: 'Kocaman Mermiler', desc: '+18% mermi boyutu', icon: '●', color: '#6bd6ff', max: 4, mods: { size: 0.18 } },
  { id: 'itis', name: 'İtiş Gücü', desc: '+35% geri itme', icon: '⇥', color: '#ffb36b', max: 3, mods: { knockMul: 0.35 } },
  { id: 'olumcul', name: 'Ölümcül Darbe', desc: 'Kritik vuruşlar +0.5x daha çok vurur', icon: '✖', color: '#ff4d6d', max: 4, mods: { critDmg: 0.5 } },
  { id: 'bilgelik', name: 'Bilgelik', desc: '+12% XP', icon: '★', color: '#7de8ff', max: 5, mods: { xpMul: 0.12 } },
  { id: 'sifael', name: 'Şifa Eli', desc: '+2.5% kalp düşme şansı', icon: '❤', color: '#ff7a9a', max: 4, mods: { heartDrop: 0.025 } },
  { id: 'uzunatilim', name: 'Uzun Atılma', desc: 'Atılma +3 tick daha uzun sürer', icon: '⟿', color: '#a98bff', max: 3, mods: { dashLen: 3 } },
  { id: 'ezici', name: 'Ezici Atılma', desc: 'Atılırken içinden geçtiğin düşmana 25 hasar', icon: '⚡', color: '#7ab8ff', max: 4, mods: { dashHit: 25 } },
  { id: 'celik', name: 'Çelik Deri', desc: 'Her vuruştan 2 hasar eksilir', icon: '▣', color: '#9fb4d9', max: 4, mods: { flatArmor: 2 } },
  { id: 'ofke', name: 'Öfke Patlaması', desc: 'Canın %50 altındayken +25% hasar', icon: '☄', color: '#ff5a3d', max: 3, mods: { rage: 0.25 } },
  { id: 'kankudreti', name: 'Kan Kudreti', desc: 'Öldürünce 2 sn boyunca +20% atış hızı', icon: '♨', color: '#ff6b6b', max: 4, mods: { frenzy: 0.2 } },
  { id: 'ruhemici', name: 'Ruh Emici', desc: 'Her öldürmede +0.6 can', icon: '✚', color: '#8cffd0', max: 4, mods: { killHeal: 0.6 } },
  { id: 'genis', name: 'Geniş Etki', desc: 'Patlama, halka ve dalga alanları +18%', icon: '◍', color: '#ffa86b', max: 4, mods: { area: 0.18 } },
  { id: 'yuva', name: 'Ek Silah Yuvası', desc: '+1 silah taşıma yuvası', icon: '▤', color: '#ffe066', max: 2, mods: { slots: 1 } },
  { id: 'arayan', name: 'Hedef Arayan Mermiler', desc: 'Mermiler hafifçe hedefe kıvrılır', icon: '⌖', color: '#ff8bd9', max: 3, mods: { seek: 1 } },
  { id: 'parcala', name: 'Parçalanma', desc: 'Vuran mermiler 2 kıymık saçar', icon: '✳', color: '#ffc46b', max: 2, mods: { frag: 1 } },
  { id: 'sis', name: 'Dondurucu Sis', desc: 'Yakınındaki düşmanlar %20 yavaşlar', icon: '☁', color: '#bfefff', max: 3, mods: { chill: 0.2 } },
  { id: 'ikinci', name: 'İkinci Şans', desc: 'Ölümcül darbede canın %50\'siyle ayağa kalk (koşuda)', icon: '✦', color: '#fff27a', max: 2, mods: { secondWind: 1 } },
  { id: 'kanama', name: 'Kanama', desc: 'Vuruşlar düşmanı kanatır (zamanla hasar)', icon: '♦', color: '#c81d4a', max: 4, mods: { bleed: 1 } },
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
  st.dodge = Math.min(st.dodge, 0.4);
  st.execute = Math.min(st.execute, 0.25);
  st.dashCd = Math.min(st.dashCd, 0.6);
  st.damage = Math.max(st.damage, 0.3);
  return st;
}
