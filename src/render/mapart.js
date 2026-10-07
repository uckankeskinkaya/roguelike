// Drawing for the open map: floor zones, obstacles, structures (POIs),
// guardian bosses and the minimap. Everything is vector/procedural.
import { ARENA_W, ARENA_H, PLAYER_COLORS } from '../config.js';
import { POI_DEFS, GUARDIAN_COLORS, GOLD_COLOR, poiName } from '../sim/map.js';
import { glow, withAlpha } from './sprites.js';

const TAU = Math.PI * 2;
const rnd = (seed, i) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };

export function poiColor(poi) {
  return poi.type === 'chest' && poi.tier ? GOLD_COLOR : POI_DEFS[poi.type].color;
}

// ------------------------------------------------------------------- floor
export function drawZones(ctx, map, v) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.11;
  for (const z of map.zones) {
    if (z.x + z.r < v.x0 || z.x - z.r > v.x1 || z.y + z.r < v.y0 || z.y - z.r > v.y1) continue;
    ctx.drawImage(glow(z.color, 128), z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// --------------------------------------------------------------- obstacles
export function drawObstacles(ctx, map, v, time) {
  const vis = [];
  for (const b of map.obstacles) {
    if (b.x + b.r < v.x0 || b.x - b.r > v.x1 || b.y + b.r < v.y0 || b.y - b.r > v.y1) continue;
    vis.push(b);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  for (const b of vis) { ctx.moveTo(b.x + 7 + b.r, b.y + 9); ctx.ellipse(b.x + 7, b.y + 9, b.r * 1.05, b.r * 0.9, 0, 0, TAU); }
  ctx.fill();
  for (const b of vis) {
    if (b.kind === 'rock') {
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = b.r * (0.82 + rnd(b.seed, i) * 0.22);
        ctx[i ? 'lineTo' : 'moveTo'](b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = '#141a2c'; ctx.fill();
      ctx.strokeStyle = '#2d3961'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(150,175,255,0.16)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.1, b.y - b.r * 0.1, b.r * 0.55, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
    } else if (b.kind === 'pillar') {
      ctx.fillStyle = '#171d33'; ctx.strokeStyle = '#3a4772'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(77,240,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + b.seed;
        ctx.beginPath(); ctx.moveTo(b.x + Math.cos(a) * b.r * 0.62, b.y + Math.sin(a) * b.r * 0.62); ctx.lineTo(b.x + Math.cos(a) * b.r * 0.9, b.y + Math.sin(a) * b.r * 0.9); ctx.stroke();
      }
    } else {
      const col = b.seed % 2 ? '#4df0ff' : '#ff5ad1';
      ctx.fillStyle = withAlpha(col, 0.22); ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + b.seed, d = i ? b.r * 0.5 : 0, h = b.r * (i ? 0.7 : 1.05);
        const cx = b.x + Math.cos(a) * d, cy = b.y + Math.sin(a) * d;
        ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h * 0.55, cy); ctx.lineTo(cx, cy + h * 0.8); ctx.lineTo(cx - h * 0.55, cy); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
  }
  // crystal glow
  ctx.globalCompositeOperation = 'lighter';
  for (const b of vis) {
    if (b.kind !== 'crystal') continue;
    ctx.globalAlpha = 0.45 + 0.15 * Math.sin(time * 2 + b.seed);
    ctx.drawImage(glow(b.seed % 2 ? '#4df0ff' : '#ff5ad1', 64), b.x - b.r * 2, b.y - b.r * 2, b.r * 4, b.r * 4);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------- structures
export function drawPois(ctx, view, me, time, v) {
  for (const poi of view.pois || []) {
    if (poi.x + 260 < v.x0 || poi.x - 260 > v.x1 || poi.y + 260 < v.y0 || poi.y - 260 > v.y1) continue;
    const done = poi.state === 2;
    const col = poiColor(poi);
    const x = poi.x, y = poi.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';

    // ground plate
    ctx.fillStyle = done ? 'rgba(20,24,40,0.6)' : withAlpha(col, 0.08);
    ctx.strokeStyle = done ? 'rgba(120,130,170,0.25)' : withAlpha(col, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, poi.r, 0, TAU); ctx.fill();
    ctx.setLineDash(poi.type === 'pylon' ? [14, 10] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    const C = done ? '#5a6285' : col;
    ctx.strokeStyle = C; ctx.fillStyle = '#0f1322'; ctx.lineWidth = 3;
    switch (poi.type) {
      case 'chest': {
        const lid = done ? -9 : 0;
        ctx.beginPath(); ctx.rect(-17, -6, 34, 18); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-17, -6); ctx.quadraticCurveTo(0, -20 + lid, 17, -6); ctx.lineTo(-17, -6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C; ctx.fillRect(-3, 0, 6, 8);
        if (poi.locked) {
          ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(-22, -14); ctx.lineTo(22, 16); ctx.moveTo(22, -14); ctx.lineTo(-22, 16); ctx.stroke();
        }
        break;
      }
      case 'fountain': {
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); ctx.stroke();
        if (!done) {
          ctx.strokeStyle = withAlpha(col, 0.6); ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) { const k = ((time * 0.6 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(0, 0, 4 + k * 20, 0, TAU); ctx.stroke(); }
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'shrine': {
        ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(16, 12); ctx.lineTo(0, 22); ctx.lineTo(-16, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (!done) {
          ctx.globalCompositeOperation = 'lighter';
          const f = 1 + 0.2 * Math.sin(time * 9);
          ctx.drawImage(glow('#ff4d6d', 32), -22 * f, -52 * f, 44 * f, 44 * f);
          ctx.globalCompositeOperation = 'source-over';
        }
        if (poi.state === 1) { // ambush ring
          ctx.strokeStyle = withAlpha('#ff4d6d', 0.35 + 0.2 * Math.sin(time * 6)); ctx.lineWidth = 3; ctx.setLineDash([10, 12]);
          ctx.beginPath(); ctx.arc(0, 0, 230, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        break;
      }
      case 'pylon': {
        ctx.save(); ctx.rotate(time * 0.4);
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 24, Math.sin(a) * 24); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(9, 0); ctx.lineTo(0, 16); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fillStyle = C; ctx.fill();
        if (poi.state === 1) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 8);
          ctx.drawImage(glow('#4df0ff', 64), -poi.r, -poi.r, poi.r * 2, poi.r * 2);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'totem': {
        ctx.beginPath(); ctx.rect(-11, -30, 22, 54); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C; ctx.beginPath(); ctx.ellipse(0, -14, 6, 4, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(7, 2); ctx.moveTo(-7, 10); ctx.lineTo(7, 10); ctx.stroke();
        break;
      }
    }
    if (!done) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(time * 3 + poi.id);
      ctx.drawImage(glow(col, 64), -poi.r * 1.3, -poi.r * 1.3, poi.r * 2.6, poi.r * 2.6);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // progress ring
    if (poi.prog > 0 && !done) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, poi.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (poi.prog / 255)); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.restore();

    // label when a local player is close
    if (me && Math.hypot(me.x - x, me.y - y) < 320 && !done) {
      const def = POI_DEFS[poi.type];
      ctx.textAlign = 'center';
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
      const name = poiName(poi.type, poi.tier);
      ctx.strokeText(name, x, y - poi.r - 22); ctx.fillStyle = col; ctx.fillText(name, x, y - poi.r - 22);
      ctx.font = '600 11px system-ui, sans-serif';
      const hint = poi.locked ? 'Kilitli: Muhafızı yen' : poi.state === 1 ? (poi.type === 'shrine' ? 'Pusuyu temizle!' : 'Alanda kal!') : def.hint;
      ctx.strokeText(hint, x, y - poi.r - 8); ctx.fillStyle = poi.locked ? '#ff8099' : '#dfe8ff'; ctx.fillText(hint, x, y - poi.r - 8);
    }
  }
}

// Beacons are drawn above the darkness so structures can be spotted from afar.
export function drawPoiBeacons(ctx, view, time) {
  ctx.globalCompositeOperation = 'lighter';
  for (const poi of view.pois || []) {
    if (poi.state === 2) continue;
    ctx.globalAlpha = 0.28 + 0.1 * Math.sin(time * 3 + poi.id);
    const r = poi.r * 1.6;
    ctx.drawImage(glow(poiColor(poi), 64), poi.x - r, poi.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// -------------------------------------------------------------- guardians
export function drawGuardian(ctx, e, time, flash, me, p) {
  const r = e.r;
  const col = GUARDIAN_COLORS[e.v || 0];
  ctx.lineJoin = 'round';
  if (e.asleep) {
    ctx.fillStyle = '#10131f'; ctx.strokeStyle = withAlpha(col, 0.35); ctx.lineWidth = 4;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = withAlpha(col, 0.5); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-r * 0.4, 0); ctx.quadraticCurveTo(0, r * 0.18, r * 0.4, 0); ctx.stroke();
    // slow breathing glow + "zzz"
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 + 0.08 * Math.sin(time * 1.6);
    ctx.drawImage(glow(col, 64), -r * 2, -r * 2, r * 4, r * 4);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = withAlpha(col, 0.7); ctx.font = '800 14px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('z', r * 0.6, -r - 4 - Math.sin(time * 2) * 3);
    return;
  }
  const enraged = e.enraged || (e.maxHp > 1 && e.hp < e.maxHp * 0.5) || (e.maxHp === 1 && e.hp < 0.5);
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.08 * Math.sin(time * (enraged ? 10 : 4));
  ctx.globalAlpha = 0.55;
  ctx.drawImage(glow(col, 64), -r * 2.6 * pulse, -r * 2.6 * pulse, r * 5.2 * pulse, r * 5.2 * pulse);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 4;
  for (let ring = 0; ring < 2; ring++) {
    const rr = r + 9 + ring * 11, n = 5 + ring * 2, rot = time * (ring ? -0.9 : 0.7) * (enraged ? 2 : 1);
    ctx.strokeStyle = flash ? '#fff' : withAlpha(col, ring ? 0.5 : 0.9);
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; ctx.beginPath(); ctx.arc(0, 0, rr, a, a + (TAU / n) * 0.55); ctx.stroke(); }
  }
  ctx.fillStyle = flash ? '#4a3a30' : '#140f0a'; ctx.strokeStyle = flash ? '#fff' : col; ctx.lineWidth = 4;
  ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + time * 0.2; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  let ex = 0, ey = 0;
  if (me) { const a = Math.atan2(me.y - p.y, me.x - p.x); ex = Math.cos(a) * r * 0.25; ey = Math.sin(a) * r * 0.25; }
  ctx.fillStyle = '#fff3d9'; ctx.beginPath(); ctx.ellipse(ex * 0.4, ey * 0.4, r * 0.5, r * 0.34, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, r * 0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.05, r * 0.17, 0, 0, TAU); ctx.fill();
}

// ----------------------------------------------------------------- minimap
const staticCache = new WeakMap();
const MW = 220, MH = Math.round((220 * ARENA_H) / ARENA_W);

function staticLayer(map) {
  let c = staticCache.get(map);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = MW; c.height = MH;
  const g = c.getContext('2d');
  const sx = MW / ARENA_W, sy = MH / ARENA_H;
  g.fillStyle = '#080b16'; g.fillRect(0, 0, MW, MH);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3;
  for (const z of map.zones) g.drawImage(glow(z.color, 64), (z.x - z.r) * sx, (z.y - z.r) * sy, z.r * 2 * sx, z.r * 2 * sy);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(120,140,200,0.45)';
  for (const b of map.obstacles) { g.beginPath(); g.arc(b.x * sx, b.y * sy, Math.max(1, b.r * sx), 0, TAU); g.fill(); }
  staticCache.set(map, c);
  return c;
}

export function drawMinimap(r, view, localPid, x, y, width, time) {
  const { ctx } = r;
  if (!view.map) return;
  const height = (width * ARENA_H) / ARENA_W;
  const sx = width / ARENA_W, sy = height / ARENA_H;
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.drawImage(staticLayer(view.map), x, y, width, height);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(140,160,255,0.45)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();

  for (const poi of view.pois || []) {
    const px = x + poi.x * sx, py = y + poi.y * sy;
    ctx.fillStyle = poi.state === 2 ? 'rgba(130,140,170,0.5)' : poiColor(poi);
    if (poi.type === 'chest') ctx.fillRect(px - 3, py - 2.5, 6, 5);
    else if (poi.type === 'shrine') { ctx.beginPath(); ctx.moveTo(px, py - 4.5); ctx.lineTo(px + 3.5, py + 3); ctx.lineTo(px - 3.5, py + 3); ctx.fill(); }
    else if (poi.type === 'pylon') { ctx.beginPath(); ctx.moveTo(px, py - 4.5); ctx.lineTo(px + 3.5, py); ctx.lineTo(px, py + 4.5); ctx.lineTo(px - 3.5, py); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(px, py, 3.2, 0, TAU); ctx.fill(); }
    if (poi.locked) { ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 1.5; ctx.strokeRect(px - 5, py - 5, 10, 10); }
  }
  for (const e of view.enemies) {
    if (!e.guardian && !e.boss) continue;
    const px = x + e.x * sx, py = y + e.y * sy;
    const col = e.boss ? '#ff3355' : GUARDIAN_COLORS[e.v || 0];
    ctx.fillStyle = col;
    const s = e.boss ? 5 + Math.sin(time * 8) : e.asleep ? 3.2 : 4.5;
    ctx.globalAlpha = e.asleep ? 0.55 : 1;
    ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#05060c'; ctx.lineWidth = 1; ctx.stroke();
  }
  for (const p of view.players) {
    const px = x + p.x * sx, py = y + p.y * sy;
    ctx.fillStyle = p.downed ? '#777' : PLAYER_COLORS[p.pid % PLAYER_COLORS.length];
    ctx.beginPath(); ctx.arc(px, py, p.pid === localPid ? 3.2 : 2.5, 0, TAU); ctx.fill();
    if (p.pid === localPid) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); }
  }
  // camera viewport
  const z = r.cam.zoom;
  const vw = r.w / z, vh = r.h / z;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + (r.cam.x - vw / 2) * sx, y + (r.cam.y - vh / 2) * sy, vw * sx, vh * sy);
  ctx.restore();
  return height;
}
