// Vector icons for weapons and skills (used on canvas HUD and in DOM cards).
import { WEAPONS } from '../sim/weapons.js';
import { SKILL_BY_ID } from '../sim/skills.js';

// Draws a weapon silhouette centered at (0,0), pointing right, ~size px long.
export function drawWeapon(ctx, id, size, glowOn = true) {
  const w = WEAPONS[id];
  const s = size / 24;
  ctx.save();
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#141826';
  ctx.strokeStyle = w.color;
  ctx.lineWidth = 2;
  if (glowOn) { ctx.shadowColor = w.color; ctx.shadowBlur = 6; }
  ctx.beginPath();
  switch (w.kind) {
    case 'bullet':
      if (id === 'sacma') { ctx.rect(-10, -4, 22, 8); ctx.rect(-12, -2, 4, 8); }
      else if (id === 'igne') { ctx.rect(-8, -3, 20, 6); ctx.rect(-4, 3, 4, 6); }
      else if (id === 'kesici') { ctx.moveTo(-12, -1.5); ctx.lineTo(8, -1.5); ctx.lineTo(14, 0); ctx.lineTo(8, 1.5); ctx.lineTo(-12, 1.5); ctx.closePath(); ctx.moveTo(-6, -5); ctx.lineTo(-6, 5); }
      else if (id === 'zehir') { ctx.moveTo(-10, 6); ctx.quadraticCurveTo(-10, -8, 4, -8); ctx.lineTo(12, 0); ctx.lineTo(4, 8); ctx.quadraticCurveTo(-8, 8, -10, 6); }
      else if (id === 'buz') { ctx.moveTo(-12, 0); ctx.lineTo(0, -4); ctx.lineTo(12, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.moveTo(-6, -9); ctx.lineTo(4, -5); ctx.moveTo(-6, 9); ctx.lineTo(4, 5); }
      else if (id === 'ziplayan') { ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.moveTo(-12, 8); ctx.lineTo(-8, 4); ctx.moveTo(12, -8); ctx.lineTo(8, -4); }
      else if (id === 'agir') { ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.moveTo(-5, -4); ctx.lineTo(0, 0); ctx.lineTo(5, -3); }
      else { ctx.rect(-8, -4, 18, 8); ctx.rect(-8, 2, 5, 7); }
      break;
    case 'rail': ctx.rect(-12, -3, 26, 6); ctx.rect(-6, -6, 10, 12); break;
    case 'rocket': ctx.rect(-12, -5, 22, 10); ctx.moveTo(10, -6); ctx.lineTo(14, 0); ctx.lineTo(10, 6); break;
    case 'boomerang':
      ctx.moveTo(-10, 8); ctx.quadraticCurveTo(0, -14, 12, 6); ctx.quadraticCurveTo(0, -4, -10, 8); break;
    case 'smite':
    case 'arc':
      ctx.moveTo(-6, -10); ctx.lineTo(4, -2); ctx.lineTo(-2, 0); ctx.lineTo(8, 10); ctx.lineTo(-4, 2); ctx.lineTo(2, 0); ctx.closePath(); break;
    case 'flame':
      ctx.rect(-12, -4, 14, 8); ctx.moveTo(2, -6); ctx.lineTo(12, -3); ctx.lineTo(12, 3); ctx.lineTo(2, 6); ctx.closePath(); break;
    case 'meteor': ctx.arc(2, 2, 8, 0, Math.PI * 2); ctx.moveTo(-3, -4); ctx.lineTo(-13, -12); ctx.moveTo(-6, 0); ctx.lineTo(-16, -6); break;
    case 'mine': ctx.arc(0, 0, 8, 0, Math.PI * 2); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); } break;
    case 'aura': ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.moveTo(6, 0); ctx.arc(0, 0, 6, 0, Math.PI * 2); break;
    case 'pulse': ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.moveTo(11, 0); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.moveTo(16, 0); ctx.arc(0, 0, 16, 0, Math.PI * 2); break;
    case 'homing':
      ctx.rect(-10, -6, 18, 5); ctx.rect(-10, 1, 18, 5); ctx.moveTo(8, -6); ctx.lineTo(13, -3.5); ctx.lineTo(8, -1); ctx.moveTo(8, 1); ctx.lineTo(13, 3.5); ctx.lineTo(8, 6); break;
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Renders an icon into a small canvas and returns it (for DOM cards).
export function iconCanvas(card, px = 64) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = px * dpr;
  c.style.width = c.style.height = px + 'px';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.translate(px / 2, px / 2);
  if (card.t === 'w') {
    drawWeapon(g, card.id, px * 0.75);
  } else {
    const s = SKILL_BY_ID[card.id];
    g.shadowColor = s.color; g.shadowBlur = 12;
    g.strokeStyle = s.color; g.lineWidth = 2.5;
    g.beginPath();
    const r = px * 0.36;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#121626';
    g.fill(); g.stroke();
    g.shadowBlur = 8;
    g.fillStyle = s.color;
    g.font = `bold ${Math.round(px * 0.38)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s.icon, 0, 1);
  }
  return c;
}
