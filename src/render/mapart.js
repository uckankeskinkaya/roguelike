// Drawing for the open map: floor zones, obstacles, structures (POIs),
// guardian bosses and the minimap. Everything is vector/procedural.
import { ARENA_W, ARENA_H, PLAYER_COLORS, EXPLORE_W, EXPLORE_H } from '../config.js';
import { POI_DEFS, GUARDIAN_COLORS, GOLD_COLOR, poiName, isExplored, exploredFraction } from '../sim/map.js';
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

// ------------------------------------------------- fog of war, minimap, map
const FS = 0.15; // pixels of the cached map layer per world pixel
const FW = Math.round(ARENA_W * FS), FH = Math.round(ARENA_H * FS);
const layerCache = new WeakMap();

// Terrain layer of the whole map (zones + obstacles), built once per map
function terrainLayer(map) {
  let c = layerCache.get(map);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = FW; c.height = FH;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0e1b'; g.fillRect(0, 0, FW, FH);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35;
  for (const z of map.zones) g.drawImage(glow(z.color, 64), (z.x - z.r) * FS, (z.y - z.r) * FS, z.r * 2 * FS, z.r * 2 * FS);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(130,150,215,0.5)';
  for (const b of map.obstacles) { g.beginPath(); g.arc(b.x * FS, b.y * FS, Math.max(1.2, b.r * FS), 0, TAU); g.fill(); }
  layerCache.set(map, c);
  return c;
}

// Terrain masked by the explored area; rebuilt only when new cells get revealed
const foggedCache = new WeakMap();
function foggedLayer(view) {
  let f = foggedCache.get(view.map);
  if (!f) {
    f = { c: document.createElement('canvas'), mask: document.createElement('canvas'), ver: -1 };
    f.c.width = FW; f.c.height = FH;
    f.mask.width = EXPLORE_W; f.mask.height = EXPLORE_H;
    foggedCache.set(view.map, f);
  }
  if (f.ver !== view.exploredVer) {
    f.ver = view.exploredVer;
    const m = f.mask.getContext('2d');
    const img = m.createImageData(EXPLORE_W, EXPLORE_H);
    const ex = view.explored;
    for (let i = 0; i < ex.length; i++) { img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = ex[i] ? 255 : 0; }
    m.putImageData(img, 0, 0);
    const g = f.c.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, FW, FH);
    g.drawImage(terrainLayer(view.map), 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.imageSmoothingEnabled = true;
    g.drawImage(f.mask, 0, 0, FW, FH); // bilinear upscale = soft fog edge
    g.globalCompositeOperation = 'source-over';
  }
  return f.c;
}

function marker(ctx, poi, px, py, k) {
  ctx.fillStyle = poi.state === 2 ? 'rgba(130,140,170,0.55)' : poiColor(poi);
  const u = 3.4 * k;
  if (poi.type === 'chest') ctx.fillRect(px - u, py - u * 0.8, u * 2, u * 1.6);
  else if (poi.type === 'shrine') { ctx.beginPath(); ctx.moveTo(px, py - u * 1.4); ctx.lineTo(px + u * 1.1, py + u); ctx.lineTo(px - u * 1.1, py + u); ctx.fill(); }
  else if (poi.type === 'pylon') { ctx.beginPath(); ctx.moveTo(px, py - u * 1.4); ctx.lineTo(px + u * 1.1, py); ctx.lineTo(px, py + u * 1.4); ctx.lineTo(px - u * 1.1, py); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(px, py, u, 0, TAU); ctx.fill(); }
  if (poi.locked) { ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 1.5 * k; ctx.strokeRect(px - u * 1.5, py - u * 1.5, u * 3, u * 3); }
}

// Draws terrain + discovered markers into a rectangle. `win` = visible world
// window {x0, y0, w}: scale = rect width / win.w.
function paintMap(r, view, localPid, x, y, width, height, win, k, time) {
  const { ctx } = r;
  const sc = width / win.w;
  ctx.fillStyle = 'rgba(4,6,14,0.82)';
  ctx.fillRect(x, y, width, height);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(foggedLayer(view), x - win.x0 * sc, y - win.y0 * sc, ARENA_W * sc, ARENA_H * sc);
  const X = (wx) => x + (wx - win.x0) * sc, Y = (wy) => y + (wy - win.y0) * sc;
  for (const poi of view.pois || []) {
    if (!isExplored(view.explored, poi.x, poi.y)) continue;
    marker(ctx, poi, X(poi.x), Y(poi.y), k);
  }
  for (const e of view.enemies) {
    if (!e.guardian && !e.boss) continue;
    if (!e.boss && !isExplored(view.explored, e.x, e.y)) continue;
    ctx.globalAlpha = e.asleep ? 0.6 : 1;
    ctx.fillStyle = e.boss ? '#ff3355' : GUARDIAN_COLORS[e.v || 0];
    const sz = (e.boss ? 5.5 + Math.sin(time * 8) : e.asleep ? 3.6 : 4.8) * k;
    ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), sz, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#05060c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const p of view.players) {
    ctx.fillStyle = p.downed ? '#777' : PLAYER_COLORS[p.pid % PLAYER_COLORS.length];
    ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), (p.pid === localPid ? 3.6 : 2.8) * k, 0, TAU); ctx.fill();
    if (p.pid === localPid) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4 * k; ctx.stroke(); }
  }
  // camera viewport
  const z = r.cam.zoom;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(X(r.cam.x - r.w / z / 2), Y(r.cam.y - r.h / z / 2), (r.w / z) * sc, (r.h / z) * sc);
  ctx.restore();
  ctx.strokeStyle = 'rgba(140,160,255,0.5)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

// Small corner minimap: a window around the local player
const MINI_SPAN = 2200;
export function drawMinimap(r, view, localPid, x, y, width, time) {
  if (!view.map || !view.explored) return 0;
  const height = Math.round(width * 0.72);
  const me = view.players.find((p) => p.pid === localPid) || view.players[0];
  const cx = me ? me.x : ARENA_W / 2, cy = me ? me.y : ARENA_H / 2;
  const spanH = MINI_SPAN * (height / width);
  paintMap(r, view, localPid, x, y, width, height, { x0: cx - MINI_SPAN / 2, y0: cy - spanH / 2, w: MINI_SPAN }, 1, time);
  return height;
}

// Full-screen map (toggle with M / Select / the map button)
export function drawWorldMap(r, view, localPid, time) {
  if (!view.map || !view.explored) return;
  const { ctx, w, h } = r;
  ctx.fillStyle = 'rgba(2,3,8,0.9)';
  ctx.fillRect(0, 0, w, h);
  const pad = Math.min(60, w * 0.05);
  const topH = 54, botH = 46;
  const availW = w - pad * 2, availH = h - topH - botH - pad;
  const k = Math.min(availW / ARENA_W, availH / ARENA_H);
  const mw = ARENA_W * k, mh = ARENA_H * k;
  const mx = (w - mw) / 2, my = topH + (availH - mh) / 2 + 6;
  paintMap(r, view, localPid, mx, my, mw, mh, { x0: 0, y0: 0, w: ARENA_W }, Math.max(1, mw / 700) * 1.5, time);
  ctx.textAlign = 'center';
  ctx.font = '900 22px system-ui, sans-serif';
  ctx.fillStyle = '#c9d6ff';
  ctx.fillText('HARİTA', w / 2, 34);
  const pct = Math.round(exploredFraction(view.explored) * 100);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,214,255,0.65)';
  ctx.fillText(`Keşfedilen: %${pct}  ·  kapatmak için M / Esc / harita düğmesi`, w / 2, my + mh + 26);
  // legend
  const items = [['chest', 'Sandık'], ['shrine', 'Sunak'], ['pylon', 'Kule'], ['fountain', 'Pınar'], ['totem', 'Totem']];
  ctx.textAlign = 'left';
  ctx.font = '600 12px system-ui, sans-serif';
  let lx = mx;
  for (const [type, label] of items) {
    marker(ctx, { type, state: 0, tier: 0 }, lx + 6, my - 14, 1.3);
    ctx.fillStyle = '#dfe8ff';
    ctx.fillText(label, lx + 16, my - 10);
    lx += 16 + ctx.measureText(label).width + 16;
  }
  ctx.fillStyle = GUARDIAN_COLORS[0]; ctx.beginPath(); ctx.arc(lx + 5, my - 14, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#dfe8ff'; ctx.fillText('Muhafız', lx + 16, my - 10);
}
