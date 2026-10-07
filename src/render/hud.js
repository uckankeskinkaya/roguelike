// Screen-space HUD drawn on the canvas.
import { PLAYER_COLORS, FINAL_WAVE, TICK_RATE } from '../config.js';
import { TIER_NAMES } from '../sim/weapons.js';
import { ENEMIES } from '../sim/enemies.js';
import { drawWeapon } from './icons.js';
import { dashCooldownTicks } from '../sim/player.js';
import { drawMinimap } from './mapart.js';
import { GUARDIAN_COLORS } from '../sim/map.js';

function bar(ctx, x, y, w, h, frac, col, bg = 'rgba(0,0,0,0.55)') {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function drawHUD(r, view, localPid, info) {
  const { ctx, dpr, w, h, fx } = r;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!view) return;
  const me = view.players.find((p) => p.pid === localPid);
  const small = w < 700;
  const S = small ? 0.85 : 1;
  const pad = 14 + (info.safeTop || 0);

  // --- player panel (top-left)
  if (me && me.st) {
    const col = PLAYER_COLORS[me.pid];
    const bw = 230 * S;
    const x = 16, y = pad;
    bar(ctx, x, y, bw, 18 * S, me.hp / me.st.maxHp, me.downed ? '#555' : '#ff3d5e');
    ctx.font = `700 ${12 * S}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.ceil(me.hp)} / ${Math.round(me.st.maxHp)}`, x + 6, y + 13 * S);
    // xp
    const lp = fx.levelPulse || 0;
    bar(ctx, x, y + 22 * S, bw, 8 * S, view.xp / view.xpNext, lp > 0 ? '#ffffff' : '#4dd8ff');
    ctx.fillStyle = '#4dd8ff';
    ctx.font = `800 ${12 * S}px system-ui, sans-serif`;
    ctx.fillText(`SV ${view.level}`, x + bw + 8, y + 30 * S);
    // dash
    const dmax = dashCooldownTicks(me.st.dashCd);
    const ready = me.dashCd <= 0;
    const dx = x + bw + 22, dy = y + 9 * S;
    ctx.strokeStyle = 'rgba(169,139,255,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(dx, dy, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ready ? '#a98bff' : 'rgba(169,139,255,0.8)';
    ctx.beginPath(); ctx.arc(dx, dy, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - me.dashCd / dmax)); ctx.stroke();
    if (ready) { ctx.fillStyle = '#a98bff'; ctx.beginPath(); ctx.arc(dx, dy, 4, 0, Math.PI * 2); ctx.fill(); }

    // weapons (top-right)
    const n = me.weapons.length;
    for (let i = 0; i < n; i++) {
      const wx = w - 16 - (n - i) * 52 * S + 26 * S, wy = pad + 20 * S;
      ctx.fillStyle = 'rgba(10,12,24,0.7)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(wx - 23 * S, wy - 20 * S, 46 * S, 40 * S);
      ctx.strokeRect(wx - 23 * S, wy - 20 * S, 46 * S, 40 * S);
      ctx.save();
      ctx.translate(wx, wy - 3 * S);
      drawWeapon(ctx, me.weapons[i].id, 28 * S);
      ctx.restore();
      ctx.fillStyle = '#ffd23f';
      ctx.font = `800 ${10 * S}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(TIER_NAMES[me.weapons[i].tier], wx, wy + 16 * S);
    }
    ctx.textAlign = 'left';
  }

  // --- buff indicator
  if (me && me.buffT > 0) {
    ctx.font = `800 ${11 * S}px system-ui, sans-serif`;
    ctx.fillStyle = '#c08bff';
    ctx.textAlign = 'left';
    ctx.fillText(`✦ Savaş Totemi  ${Math.ceil(me.buffT / TICK_RATE)} sn`, 18, pad + 46 * S);
  }

  // --- minimap + loot feed (right side, under the pause button)
  const mw = Math.round(Math.min(200, Math.max(120, w * 0.17)) * (small ? 0.85 : 1));
  const mx = w - 16 - mw, my = pad + 104;
  const mh = drawMinimap(r, view, localPid, mx, my, mw, r.time) || 0;
  {
    ctx.textAlign = 'right';
    ctx.font = `700 ${12 * S}px system-ui, sans-serif`;
    let fy = my + mh + 18;
    for (const f of fx.feed) {
      const k = f.t / f.life;
      ctx.globalAlpha = Math.min(1, (1 - k) * 3, f.t * 6);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round';
      ctx.strokeText(f.text, w - 16, fy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, w - 16, fy);
      fy += 18 * S;
    }
    ctx.globalAlpha = 1;
  }

  // --- teammates
  if (view.players.length > 1) {
    let y = pad + 52 * S;
    ctx.font = `600 ${11 * S}px system-ui, sans-serif`;
    for (const p of view.players) {
      if (p.pid === localPid) continue;
      const col = PLAYER_COLORS[p.pid];
      ctx.fillStyle = col;
      ctx.globalAlpha = p.connected ? 1 : 0.4;
      ctx.beginPath(); ctx.arc(22, y + 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(p.name + (p.downed ? ' (yerde)' : '') + (!p.connected ? ' (koptu)' : ''), 32, y + 8);
      if (p.st) bar(ctx, 32, y + 12, 100 * S, 4, p.hp / p.st.maxHp, p.downed ? '#555' : col);
      ctx.globalAlpha = 1;
      y += 24 * S;
    }
  }

  // --- wave info (top-center)
  ctx.textAlign = 'center';
  const cx = w / 2;
  let title = '';
  let sub = '';
  if (view.phase === 'wave') {
    title = `DALGA ${view.wave} / ${FINAL_WAVE}`;
    if (view.waveTicks > 0) sub = `${view.waveTicks}`;
  } else if (view.phase === 'pick') title = view.wave === 0 ? 'SİLAHINI SEÇ' : 'GÜÇLENDİRME';
  else if (view.phase === 'countdown') title = `DALGA ${view.wave + 1} / ${FINAL_WAVE}`;
  ctx.font = `800 ${14 * S}px system-ui, sans-serif`;
  ctx.fillStyle = '#c9d6ff';
  ctx.fillText(title, cx, pad + 12);
  if (sub) {
    ctx.font = `800 ${28 * S}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillStyle = +sub <= 5 ? '#7dff6a' : '#ffffff';
    ctx.fillText(sub, cx, pad + 42 * S);
    ctx.font = `600 ${10 * S}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(200,214,255,0.55)';
    ctx.fillText('KALAN DÜŞMAN', cx, pad + 54 * S);
  }

  // boss bar
  const boss = view.bossId ? view.enemies.find((e) => e.id === view.bossId) : null;
  if (boss) {
    const bw = Math.min(560, w * 0.6);
    const by = pad + 26;
    bar(ctx, cx - bw / 2, by, bw, 12, boss.hp / boss.maxHp, boss.hp < boss.maxHp * 0.5 ? '#ff2244' : '#ff3355');
    ctx.font = `800 ${12 * S}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffd0d8';
    ctx.fillText(ENEMIES.gozcu.name.toUpperCase() + (boss.hp < boss.maxHp * 0.5 ? ' — ÖFKELİ' : ''), cx, by + 28);
  }

  // awake guardian bar (closest one to the local player)
  if (!boss && me) {
    let g = null, gd = 1000;
    for (const e of view.enemies) {
      if (!e.guardian || e.asleep) continue;
      const d = Math.hypot(e.x - me.x, e.y - me.y);
      if (d < gd) { gd = d; g = e; }
    }
    if (g) {
      const bw = Math.min(380, w * 0.45), by = pad + 64 * S;
      const col = GUARDIAN_COLORS[g.v || 0];
      bar(ctx, cx - bw / 2, by, bw, 9, g.hp / g.maxHp, col);
      ctx.font = `800 ${11 * S}px system-ui, sans-serif`;
      ctx.fillStyle = col;
      ctx.fillText('MUHAFIZ', cx, by + 22);
    }
  }

  // countdown
  if (view.phase === 'countdown') {
    const secs = Math.ceil(view.countdown / TICK_RATE);
    const frac = (view.countdown % TICK_RATE) / TICK_RATE;
    ctx.font = `900 ${Math.round(90 * (0.8 + frac * 0.4))}px system-ui, sans-serif`;
    ctx.globalAlpha = 0.4 + frac * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(secs), cx, h * 0.42);
    ctx.globalAlpha = 1;
  }

  // banner
  const b = info.hideBanner ? null : fx.banner;
  if (b) {
    const k = b.t / b.dur;
    const a = Math.min(1, b.t * 5, (1 - k) * 4);
    const slide = (1 - Math.min(1, b.t * 4)) * 30;
    ctx.globalAlpha = a;
    ctx.font = `900 ${Math.round((small ? 30 : 44))}px system-ui, sans-serif`;
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 20;
    ctx.fillText(b.text, cx + slide, h * 0.3);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = `500 ${small ? 13 : 16}px system-ui, sans-serif`;
      ctx.fillStyle = '#c9d6ff';
      ctx.fillText(b.sub, cx - slide, h * 0.3 + 30);
    }
    ctx.globalAlpha = 1;
  }

  // downed hint
  if (me && me.downed && view.phase === 'wave') {
    ctx.font = `700 ${15 * S}px system-ui, sans-serif`;
    ctx.fillStyle = '#ff8099';
    ctx.fillText('Yerdesin — bir takım arkadaşının yanına gelmesini bekle', cx, h - 70);
  }

  // net info (bottom-left)
  if (info.netText) {
    ctx.textAlign = 'left';
    ctx.font = `500 11px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillStyle = 'rgba(200,214,255,0.55)';
    ctx.fillText(info.netText, 12, h - 10);
  }
  if (info.hint) {
    ctx.textAlign = 'center';
    ctx.font = `500 12px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(200,214,255,0.6)';
    ctx.fillText(info.hint, cx, h - 14);
  }
  ctx.textAlign = 'left';
}
