// Canvas renderer. Reads a "view" (the sim state, or the interpolated network
// view on clients) and draws it. Never mutates game state.
import { ARENA_W, ARENA_H, PLAYER_COLORS } from '../config.js';
import { WEAPONS, auraRadius } from '../sim/weapons.js';
import { ENEMIES } from '../sim/enemies.js';
import { glow, withAlpha, floorTile } from './sprites.js';
import { drawWeapon } from './icons.js';
import { P } from './particles.js';
import { drawZones, drawObstacles, drawPois, drawPoiBeacons, drawGuardian } from './mapart.js';
import { dashCooldownTicks } from '../sim/player.js';
import { REVIVE_TICKS } from '../config.js';

const TAU = Math.PI * 2;
const DEC = 4; // blood/scorch decals are stored at 1/4 resolution
const EB_COLORS = ['#ff3d6e', '#7dff6a', '#3ee6ff', '#ff3355', '#ff5ad1'];

const lerp = (a, b, t) => a + (b - a) * t;

export class Renderer {
  constructor(canvas, fx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.fx = fx;
    this.cam = { x: ARENA_W / 2, y: ARENA_H / 2, zoom: 1 };
    this.shakeX = 0; this.shakeY = 0; this.shakeR = 0;
    this.time = 0;
    this.frameDt = 1 / 60;
    this.aimSmooth = new Map();
    this.decal = document.createElement('canvas');
    this.decal.width = ARENA_W / DEC; this.decal.height = ARENA_H / DEC;
    this.dctx = this.decal.getContext('2d');
    this.lightC = document.createElement('canvas');
    this.lctx = this.lightC.getContext('2d');
    this.floorPattern = this.ctx.createPattern(floorTile(), 'repeat');
    this.lightSprite = makeLightSprite();
    this.stars = [];
    for (let i = 0; i < 160; i++) this.stars.push({ x: Math.random() * 2048, y: Math.random() * 2048, s: Math.random() * 1.6 + 0.3, p: Math.random() * 0.4 + 0.1 });
    this.dust = [];
    for (let i = 0; i < 260; i++) this.dust.push({ x: Math.random() * ARENA_W, y: Math.random() * ARENA_H, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 8, s: Math.random() * 1.5 + 0.5 });
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.cam.zoom = Math.min(this.h / 700, this.w / 760);
    this.lightC.width = Math.ceil(this.w / 2);
    this.lightC.height = Math.ceil(this.h / 2);
    // vignette
    const v = document.createElement('canvas');
    v.width = 256; v.height = 256;
    const g = v.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 60, 128, 128, 182);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    this.vignette = v;
  }

  clearDecals() { this.dctx.clearRect(0, 0, this.decal.width, this.decal.height); }

  screenToWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.cam.zoom + this.cam.x, y: (sy - this.h / 2) / this.cam.zoom + this.cam.y };
  }

  worldToScreen(x, y) {
    return { x: (x - this.cam.x) * this.cam.zoom + this.w / 2, y: (y - this.cam.y) * this.cam.zoom + this.h / 2 };
  }

  stampDecals() {
    const d = this.dctx;
    for (const s of this.fx.decals) {
      const x = s.x / DEC, y = s.y / DEC, r = s.r / DEC;
      if (s.scorch) {
        const g = d.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = g;
        d.beginPath(); d.arc(x, y, r, 0, TAU); d.fill();
      } else {
        d.fillStyle = withAlpha(s.color, 0.12);
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * TAU, k = Math.random() * r;
          d.beginPath();
          d.arc(x + Math.cos(a) * k, y + Math.sin(a) * k, r * (0.2 + Math.random() * 0.4), 0, TAU);
          d.fill();
        }
      }
    }
    this.fx.decals.length = 0;
  }

  // ------------------------------------------------------------------ frame
  render(view, alpha, localPid, dt, opts = {}) {
    const { ctx, fx } = this;
    this.time += dt;
    this.frameDt = dt;
    fx.update(dt);
    this.stampDecals();

    const me = view ? view.players.find((p) => p.pid === localPid) : null;
    const ipos = (e) => (e.px === undefined ? { x: e.x, y: e.y } : { x: lerp(e.px, e.x, alpha), y: lerp(e.py, e.y, alpha) });

    // camera
    if (view) {
      let tx = ARENA_W / 2, ty = ARENA_H / 2;
      if (me) {
        const p = opts.localPos || ipos(me);
        // look-ahead only with a mouse: with auto-aim the target flips between
        // enemies and a camera that follows it jitters on small screens
        const lead = opts.localAim ? 55 : 0;
        tx = p.x + (opts.localAim ? opts.localAim.x * lead : 0);
        ty = p.y + (opts.localAim ? opts.localAim.y * lead : 0);
      } else if (view.players.length) {
        tx = 0; ty = 0;
        for (const p of view.players) { tx += p.x; ty += p.y; }
        tx /= view.players.length; ty /= view.players.length;
      }
      const k = 1 - Math.exp(-dt * (opts.localAim ? 9 : 6));
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      const z = this.cam.zoom;
      const hw = this.w / 2 / z, hh = this.h / 2 / z;
      const m = 140;
      this.cam.x = hw * 2 > ARENA_W + m * 2 ? ARENA_W / 2 : Math.max(hw - m, Math.min(ARENA_W - hw + m, this.cam.x));
      this.cam.y = hh * 2 > ARENA_H + m * 2 ? ARENA_H / 2 : Math.max(hh - m, Math.min(ARENA_H - hh + m, this.cam.y));
    }
    {
      const zz = this.cam.zoom, mg = 120;
      this.vis = { x0: this.cam.x - this.w / 2 / zz - mg, x1: this.cam.x + this.w / 2 / zz + mg, y0: this.cam.y - this.h / 2 / zz - mg, y1: this.cam.y + this.h / 2 / zz + mg };
    }
    const tr = fx.trauma * fx.trauma;
    const T = this.time;
    this.shakeX = 26 * tr * (Math.sin(T * 61.3) + Math.sin(T * 23.7) * 0.5) + fx.kickX;
    this.shakeY = 26 * tr * (Math.sin(T * 53.1 + 1.3) + Math.sin(T * 31.9) * 0.5) + fx.kickY;
    this.shakeR = 0.035 * tr * Math.sin(T * 41.7);

    const { dpr, w, h } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, w, h);
    this.drawStars();
    if (!view) return;

    const z = this.cam.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(this.shakeR);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x + this.shakeX, -this.cam.y + this.shakeY);

    this.drawArena(view);
    if (view.map) drawObstacles(ctx, view.map, this.vis, this.time);
    drawPois(ctx, view, me, this.time, this.vis);
    for (const k of view.pickups) this.drawPickup(k, ipos(k));
    for (const t of view.teles) this.drawTele(t);
    this.drawShadows(view.enemies, ipos);
    for (const e of view.enemies) this.drawEnemy(e, ipos(e), view, me);
    for (const p of view.players) {
      if (p.pid === localPid) continue;
      this.drawPlayer(p, ipos(p), view, false, null);
    }
    if (me) this.drawPlayer(me, opts.localPos || ipos(me), view, true, opts.localAim);

    // player projectiles (additive light)
    ctx.globalCompositeOperation = 'lighter';
    for (const b of view.bullets) this.drawBullet(b, ipos(b));
    for (const l of fx.lights) {
      const a = l.life / l.max;
      ctx.globalAlpha = a * 0.35;
      ctx.drawImage(glow(l.color, 64), l.x - l.r * 0.5, l.y - l.r * 0.5, l.r, l.r);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    fx.particles.draw(ctx);

    // darkness with light around players and explosions
    this.drawLightmap(view, ipos, opts.localPos && me ? { pid: me.pid, ...opts.localPos } : null);

    // enemy bullets above the darkness: always readable
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(this.shakeR);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x + this.shakeX, -this.cam.y + this.shakeY);
    drawPoiBeacons(ctx, view, this.time);
    this.drawEBullets(view, ipos);
    this.drawBeams();
    this.drawTexts();

    // screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.vignette, 0, 0, w, h);
    let lowHp = 0;
    if (me && !me.downed && me.st) lowHp = Math.max(0, 1 - me.hp / me.st.maxHp / 0.3);
    const red = Math.max(fx.hurtFlash * 0.55, lowHp * (0.18 + 0.12 * Math.sin(T * 6)));
    if (red > 0.01) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(255,0,40,0)');
      g.addColorStop(1, `rgba(255,0,40,${red})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (fx.whiteFlash > 0.01) {
      ctx.fillStyle = `rgba(255,240,240,${fx.whiteFlash * 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawStars() {
    const { ctx, w, h } = this;
    ctx.fillStyle = '#8fa3ff';
    for (const s of this.stars) {
      const x = ((s.x - this.cam.x * s.p) % 2048 + 2048) % 2048;
      const y = ((s.y - this.cam.y * s.p) % 2048 + 2048) % 2048;
      if (x > w || y > h) continue;
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(this.time * 2 + s.x);
      ctx.fillRect(x, y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  drawArena(view) {
    const { ctx } = this;
    // only rasterize the visible part of the floor and decal layer
    const z = this.cam.zoom;
    const m = 60;
    const vx0 = Math.max(0, Math.floor(this.cam.x - this.w / 2 / z - m));
    const vy0 = Math.max(0, Math.floor(this.cam.y - this.h / 2 / z - m));
    const vx1 = Math.min(ARENA_W, Math.ceil(this.cam.x + this.w / 2 / z + m));
    const vy1 = Math.min(ARENA_H, Math.ceil(this.cam.y + this.h / 2 / z + m));
    ctx.fillStyle = this.floorPattern;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    if (view.map) drawZones(ctx, view.map, { x0: vx0, x1: vx1, y0: vy0, y1: vy1 });
    const dx0 = Math.floor(vx0 / DEC), dy0 = Math.floor(vy0 / DEC), dw = Math.ceil((vx1 - vx0) / DEC), dh = Math.ceil((vy1 - vy0) / DEC);
    if (dw > 0 && dh > 0) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.decal, dx0, dy0, dw, dh, dx0 * DEC, dy0 * DEC, dw * DEC, dh * DEC);
      ctx.globalAlpha = 1;
    }
    // central sigil
    ctx.save();
    ctx.translate(ARENA_W / 2, ARENA_H / 2);
    ctx.rotate(this.time * 0.03);
    ctx.strokeStyle = 'rgba(77,240,255,0.06)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(0, 0, 120 + i * 70, i * 0.7, i * 0.7 + Math.PI * 1.4); ctx.stroke();
    }
    ctx.restore();
    // dust motes
    ctx.fillStyle = 'rgba(160,190,255,0.25)';
    for (const d of this.dust) {
      d.x += d.vx * 0.016; d.y += d.vy * 0.016;
      if (d.y < 0) { d.y = ARENA_H; d.x = Math.random() * ARENA_W; }
      if (d.x < this.vis.x0 || d.x > this.vis.x1 || d.y < this.vis.y0 || d.y > this.vis.y1) continue;
      ctx.fillRect(d.x, d.y, d.s, d.s);
    }
    // glowing border
    const boss = view.bossId && view.enemies.some((e) => e.id === view.bossId);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2);
    const col = boss ? '#ff3355' : '#4df0ff';
    ctx.strokeStyle = withAlpha(col, 0.08 + 0.05 * pulse);
    ctx.lineWidth = 28;
    ctx.strokeRect(-14, -14, ARENA_W + 28, ARENA_H + 28);
    ctx.strokeStyle = withAlpha(col, 0.6);
    ctx.lineWidth = 3;
    ctx.strokeRect(-2, -2, ARENA_W + 4, ARENA_H + 4);
  }

  drawPickup(k, p) {
    const { ctx } = this;
    const bob = Math.sin(this.time * 5 + k.id) * 2;
    if (k.kind === 2) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow('#ff4d6d', 32), p.x - 20, p.y - 20 + bob, 40, 40);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ff4d6d';
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.bezierCurveTo(-10, -2, -6, -10, 0, -4);
      ctx.bezierCurveTo(6, -10, 10, -2, 0, 6);
      ctx.fill();
      ctx.restore();
      return;
    }
    const big = k.kind === 1;
    const s = big ? 7 : 4.5;
    const col = big ? '#5affc8' : '#4dd8ff';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(glow(col, 16), p.x - s * 3, p.y - s * 3 + bob, s * 6, s * 6);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s + bob); ctx.lineTo(p.x + s * 0.7, p.y + bob); ctx.lineTo(p.x, p.y + s + bob); ctx.lineTo(p.x - s * 0.7, p.y + bob);
    ctx.closePath();
    ctx.fill();
  }

  drawTele(t) {
    const { ctx } = this;
    const k = t.t / t.dur;
    const def = ENEMIES[t.type];
    const big = def.boss;
    const s = (big ? 60 : 12) * (1.6 - k * 0.6);
    const blink = 0.5 + 0.5 * Math.sin(this.time * 20);
    ctx.strokeStyle = withAlpha('#ff3355', 0.4 + 0.5 * blink * k);
    ctx.lineWidth = big ? 5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(t.x - s, t.y - s); ctx.lineTo(t.x + s, t.y + s);
    ctx.moveTo(t.x + s, t.y - s); ctx.lineTo(t.x - s, t.y + s);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(def.color, 0.5 * k);
    ctx.beginPath(); ctx.arc(t.x, t.y, s * 1.2 * (1 - k) + def.r * k, 0, TAU); ctx.stroke();
    if (big) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.drawImage(glow('#ff3355', 64), t.x - 200 * k, t.y - 200 * k, 400 * k, 400 * k);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawShadows(list, ipos) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    for (const e of list) {
      const p = ipos(e);
      ctx.moveTo(p.x + 3 + e.r * 0.9, p.y + e.r * 0.75);
      ctx.ellipse(p.x + 3, p.y + e.r * 0.75, e.r * 0.9, e.r * 0.35, 0, 0, TAU);
    }
    ctx.fill();
  }

  drawEnemy(e, p, view, me) {
    const { ctx } = this;
    const def = ENEMIES[e.type];
    const col = def.color;
    const flash = e.flash > 0;
    const fill = flash ? '#ffffff' : withAlpha(col, 0.18);
    const stroke = flash ? '#ffffff' : col;
    const r = e.r;
    const t = this.time;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    ctx.save();
    ctx.translate(p.x, p.y);

    if (e.elite) {
      ctx.strokeStyle = withAlpha('#ffd23f', 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r + 6 + Math.sin(t * 6) * 1.5, 0, TAU); ctx.stroke();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
    }

    switch (e.type) {
      case 'surungen': {
        ctx.rotate(e.ang);
        const wob = Math.sin(t * 14 + e.id) * 2;
        ctx.beginPath();
        ctx.moveTo(r + 2, 0); ctx.lineTo(-r, -r * 0.85 + wob); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, r * 0.85 - wob);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        this.eye(r * 0.25, 0, 2.5, col);
        break;
      }
      case 'sinek': {
        ctx.rotate(e.ang);
        const f = Math.sin(t * 40 + e.id) * 0.6;
        ctx.strokeStyle = withAlpha(col, 0.5);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r * 0.6, -r * 1.6 * (0.6 + f)); ctx.moveTo(0, 0); ctx.lineTo(-r * 0.6, r * 1.6 * (0.6 + f)); ctx.stroke();
        ctx.strokeStyle = stroke;
        ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(0, -r * 0.8); ctx.lineTo(-r, 0); ctx.lineTo(0, r * 0.8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      }
      case 'tukurgen': {
        ctx.rotate(e.ang);
        const sw = e.state === 1 ? 1.2 + Math.sin(t * 30) * 0.08 : 1;
        ctx.scale(sw, sw);
        ctx.beginPath(); ctx.arc(0, 0, r, 0.5, TAU - 0.5); ctx.lineTo(r * 0.3, 0); ctx.closePath();
        ctx.fill(); ctx.stroke();
        if (e.state === 1) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glow(col, 32), r * 0.2 - 14, -14, 28, 28); ctx.globalCompositeOperation = 'source-over'; }
        this.eye(-r * 0.2, -r * 0.35, 2.5, col);
        break;
      }
      case 'kaya': {
        if (e.state === 1 || e.state === 2) this.chargeLine(e.ang, e.state === 1 ? 340 : 60, r, e.state === 1);
        ctx.rotate(e.ang + Math.sin(t * 2 + e.id) * 0.1);
        this.poly(6, r, true);
        ctx.strokeStyle = withAlpha(flash ? '#fff' : col, 0.6);
        this.poly(6, r * 0.55, false);
        this.eye(r * 0.35, 0, 4, e.state ? '#ff3355' : col);
        break;
      }
      case 'bombaci': {
        const fuse = e.state === 1;
        const blink = fuse && Math.sin(t * 40) > 0;
        if (fuse) {
          ctx.strokeStyle = withAlpha('#ff3355', 0.25 + 0.25 * Math.sin(t * 30));
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 8]);
          ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 2.5;
        }
        ctx.fillStyle = blink ? '#ffffff' : fill;
        ctx.strokeStyle = blink ? '#ffffff' : stroke;
        const s = fuse ? 1.15 + Math.sin(t * 30) * 0.08 : 1;
        ctx.beginPath(); ctx.arc(0, 0, r * s, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r * s); ctx.quadraticCurveTo(5, -r * s - 6, 2, -r * s - 10); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow('#ffd23f', 16), -8 + 2, -r * s - 18, 16, 16);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'ok': {
        if (e.state === 1) this.chargeLine(e.ang, 440, r, true);
        ctx.rotate(e.ang);
        if (e.state === 2) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = withAlpha(col, 0.4);
          ctx.lineWidth = r;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, 0); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = stroke;
        }
        ctx.beginPath();
        ctx.moveTo(r * 1.4, 0); ctx.lineTo(-r, -r); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r, r);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 'bolunen':
      case 'yavru': {
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const a = (i / 16) * TAU;
          const rr = r * (1 + 0.1 * Math.sin(a * 3 + t * 5 + e.id));
          ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (e.type === 'bolunen') {
          ctx.strokeStyle = withAlpha(flash ? '#fff' : col, 0.7);
          ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(-3, -r * 0.3); ctx.lineTo(3, r * 0.2); ctx.lineTo(0, r); ctx.stroke();
          this.eye(-r * 0.4, -r * 0.1, 2.5, col); this.eye(r * 0.4, -r * 0.1, 2.5, col);
        } else this.eye(0, 0, 2, col);
        break;
      }
      case 'firildak': {
        ctx.rotate(e.ang);
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          const rr = i % 2 ? r * 0.55 : r;
          ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow(col, 32), -14, -14, 28, 28);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'muhafiz':
        if (e.charging === 1 && !e.asleep) this.chargeLine(e.cang !== undefined ? e.cang : e.ang, 520, r, true, r * 1.4);
        drawGuardian(ctx, e, t, flash, me, p);
        break;
      case 'gozcu':
        this.drawBoss(e, view, me, p);
        break;
    }
    ctx.restore();

    // health bar for tough enemies
    if (!e.boss && (e.elite || e.r >= 18) && e.hp < e.maxHp) {
      const wd = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(p.x - wd / 2, p.y - e.r - 12, wd, 4);
      ctx.fillStyle = e.elite ? '#ffd23f' : col;
      ctx.fillRect(p.x - wd / 2, p.y - e.r - 12, wd * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  drawBoss(e, view, me, p) {
    const { ctx } = this;
    const r = e.r;
    const t = this.time;
    const enraged = e.hp < e.maxHp * 0.5;
    const col = enraged ? '#ff2244' : '#ff3355';
    const flash = e.flash > 0;
    if (e.charging === 1) this.chargeLine(e.cang, 700, r, true, r * 1.6);
    // aura
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 1 + 0.08 * Math.sin(t * (enraged ? 10 : 4));
    ctx.globalAlpha = 0.6;
    ctx.drawImage(glow(col, 64), -r * 3 * pulse, -r * 3 * pulse, r * 6 * pulse, r * 6 * pulse);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // outer rotating segments
    ctx.lineWidth = 5;
    for (let ring = 0; ring < 2; ring++) {
      const rr = r + 14 + ring * 14;
      const n = 6 + ring * 3;
      const rot = t * (ring ? -0.9 : 0.6) * (enraged ? 2 : 1);
      ctx.strokeStyle = flash ? '#fff' : withAlpha(col, ring ? 0.5 : 0.9);
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU;
        ctx.beginPath(); ctx.arc(0, 0, rr, a, a + (TAU / n) * 0.6); ctx.stroke();
      }
    }
    // body
    // a constantly-hit boss would be permanently white: tint instead of fill
    ctx.fillStyle = flash ? '#5a1f2e' : '#1a0710';
    ctx.strokeStyle = flash ? '#fff' : col;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
    // eye tracks the local player
    let ex = 0, ey = 0;
    if (me) {
      const a = Math.atan2(me.y - p.y, me.x - p.x);
      ex = Math.cos(a) * r * 0.3; ey = Math.sin(a) * r * 0.3;
    }
    ctx.fillStyle = '#ffd0d8';
    ctx.beginPath(); ctx.ellipse(ex * 0.5, ey * 0.5, r * 0.55, r * 0.38, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(ex, ey, r * 0.24, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.06, r * 0.2, 0, 0, TAU); ctx.fill();
  }

  chargeLine(ang, len, r, warn, width = r * 1.2) {
    const { ctx } = this;
    ctx.save();
    ctx.rotate(ang);
    const a = warn ? 0.18 + 0.18 * Math.sin(this.time * 25) : 0.15;
    ctx.fillStyle = `rgba(255,51,85,${a})`;
    ctx.fillRect(r, -width / 2, len, width);
    ctx.strokeStyle = `rgba(255,51,85,${a * 2})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r, -width / 2, len, width);
    ctx.restore();
  }

  poly(n, r, fill) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
  }

  eye(x, y, r, col) {
    const { ctx } = this;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow(col, 16), x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawPlayer(p, pos, view, isLocal, localAim) {
    const { ctx } = this;
    const col = PLAYER_COLORS[p.pid % PLAYER_COLORS.length];
    const r = p.r || 14;
    const t = this.time;
    let aim;
    if (localAim) aim = Math.atan2(localAim.y, localAim.x);
    else {
      // auto-aim snaps between targets: ease the drawn gun/visor so it doesn't twitch
      const target = Math.atan2(p.aimY, p.aimX);
      let cur = this.aimSmooth.get(p.pid);
      if (cur === undefined) cur = target;
      let d = target - cur;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      cur += d * Math.min(1, this.frameDt * 14);
      this.aimSmooth.set(p.pid, cur);
      aim = cur;
    }
    const ax = Math.cos(aim), ay = Math.sin(aim);
    if (!p.connected) ctx.globalAlpha = 0.3;
    // dash afterimages
    if (p.dashT > 0 && Math.random() < 0.9) this.fx.particles.add(P.GHOST, pos.x, pos.y, 0, 0, 0.18, r, col);
    // aura weapons (Kor Halkası): a visible ring that matches the damage radius
    for (const wp of p.weapons || []) {
      if (WEAPONS[wp.id].kind !== 'aura') continue;
      const R = auraRadius(wp.id, wp.tier, p.st || {});
      const col = WEAPONS[wp.id].color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(col, 0.35 + 0.15 * Math.sin(this.time * 6));
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = -this.time * 40;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.12;
      ctx.drawImage(glow(col, 64), pos.x - R, pos.y - R, R * 2, R * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // light pool under the player
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.35;
    ctx.drawImage(glow(col, 64), pos.x - 70, pos.y - 70, 140, 140);
    ctx.globalAlpha = p.connected ? 1 : 0.3;
    ctx.globalCompositeOperation = 'source-over';

    if (p.downed) {
      ctx.fillStyle = 'rgba(40,40,50,0.9)';
      ctx.strokeStyle = withAlpha(col, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, TAU); ctx.fill(); ctx.stroke();
      // revive ring
      ctx.strokeStyle = '#8cff9e';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 10, -Math.PI / 2, -Math.PI / 2 + TAU * (p.reviveT / REVIVE_TICKS)); ctx.stroke();
      ctx.strokeStyle = withAlpha('#8cff9e', 0.25 + 0.2 * Math.sin(t * 5));
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 56, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      this.nameTag(p, pos, col, 'YERDE');
      ctx.globalAlpha = 1;
      return;
    }

    const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(t * 20) % 2 === 0;
    // orbitals
    const orb = p.st ? p.st.orbitals : 0;
    if (orb > 0) {
      const base = view.tick * 0.075;
      for (let i = 0; i < orb; i++) {
        const a = base + (i / orb) * TAU;
        const ox = pos.x + Math.cos(a) * 64, oy = pos.y + Math.sin(a) * 64;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(a * 3);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow('#e0f0ff', 16), -14, -14, 28, 28);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#e0f0ff';
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(0, 3); ctx.lineTo(-10, 0); ctx.lineTo(0, -3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // weapons around the body
    const n = p.weapons.length;
    for (let i = 0; i < n; i++) {
      const a = aim + (i - (n - 1) / 2) * 0.55;
      ctx.save();
      ctx.translate(pos.x + Math.cos(a) * 24, pos.y + Math.sin(a) * 24);
      ctx.rotate(aim);
      if (Math.abs(aim) > Math.PI / 2) ctx.scale(1, -1);
      drawWeapon(ctx, p.weapons[i].id, 20, false);
      ctx.restore();
    }
    // body
    if (blink) ctx.globalAlpha = 0.35;
    const squash = p.dashT > 0 ? 1.25 : 1;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(Math.atan2(p.vy || 0, p.vx || 0.0001));
    ctx.scale(squash, 1 / squash);
    ctx.fillStyle = '#0d1020';
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    // core + visor in aim direction
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(pos.x + ax * 5, pos.y + ay * 5, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r - 4, aim - 0.5, aim + 0.5); ctx.stroke();
    ctx.globalAlpha = p.connected ? 1 : 0.3;
    if (view.players.length > 1) this.nameTag(p, pos, col, p.connected ? '' : 'BAĞLANTI YOK');
    ctx.globalAlpha = 1;

    // dash ready ring for local player
    if (isLocal && p.dashCd > 0) {
      const max = dashCooldownTicks(p.st ? p.st.dashCd : 0);
      ctx.strokeStyle = 'rgba(169,139,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / max)); ctx.stroke();
    }
  }

  nameTag(p, pos, col, extra) {
    const { ctx } = this;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = col;
    ctx.fillText(p.name + (extra ? ` · ${extra}` : ''), pos.x, pos.y - 30);
    if (p.st && !p.downed) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(pos.x - 16, pos.y + 20, 32, 3);
      ctx.fillStyle = col;
      ctx.fillRect(pos.x - 16, pos.y + 20, 32 * Math.max(0, p.hp / p.st.maxHp), 3);
    }
  }

  drawBullet(b, p) {
    const { ctx } = this;
    const w = WEAPONS[b.w];
    const col = w.color;
    const a = Math.atan2(b.vy, b.vx);
    switch (b.kind) {
      case 'mine': {
        const armed = b.t > 18;
        const blink = armed && Math.sin(this.time * 12 + b.id) > 0.3;
        ctx.drawImage(glow(blink ? '#ff3355' : col, 32), p.x - 26, p.y - 26, 52, 52);
        ctx.fillStyle = '#0f1322'; ctx.strokeStyle = blink ? '#ff3355' : col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 6; i++) { const aa = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(aa) * 9, p.y + Math.sin(aa) * 9); ctx.lineTo(p.x + Math.cos(aa) * 14, p.y + Math.sin(aa) * 14); ctx.stroke(); }
        break;
      }
      case 'meteor': {
        const total = Math.max(1, (w.delay || 0.75) * 60);
        const k = Math.min(1, b.t / total);
        const R = b.rad || 100;
        ctx.strokeStyle = withAlpha(col, 0.35 + 0.4 * k); ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = withAlpha(col, 0.08 + 0.2 * k);
        ctx.beginPath(); ctx.arc(p.x, p.y, R * k, 0, TAU); ctx.fill();
        // the falling rock
        const fall = 1 - k;
        const fy = p.y - fall * 360;
        ctx.drawImage(glow(col, 32), p.x - 40, fy - 40, 80, 80);
        ctx.fillStyle = '#fff3d6';
        ctx.beginPath(); ctx.arc(p.x, fy, 11, 0, TAU); ctx.fill();
        ctx.strokeStyle = withAlpha(col, 0.6); ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(p.x, fy); ctx.lineTo(p.x, fy - 70); ctx.stroke();
        break;
      }
      case 'flame': {
        const life = Math.min(1, (b.t || 10) / 20);
        ctx.globalAlpha = 0.5;
        const s = b.r * 2.2;
        ctx.drawImage(glow(life > 0.6 ? '#ff4a1a' : col, 32), p.x - s, p.y - s, s * 2, s * 2);
        ctx.globalAlpha = 1;
        break;
      }
      case 'boomerang': {
        ctx.drawImage(glow(col, 32), p.x - 22, p.y - 22, 44, 44);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(this.time * 22 + b.id);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-12, 6); ctx.quadraticCurveTo(0, -14, 12, 6); ctx.quadraticCurveTo(0, -4, -12, 6);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'rocket':
      case 'homing': {
        const s = b.r * 4;
        ctx.drawImage(glow(col, 32), p.x - s, p.y - s, s * 2, s * 2);
        this.fx.particles.add(b.kind === 'rocket' ? P.SMOKE : P.DOT, p.x - Math.cos(a) * 8, p.y - Math.sin(a) * 8, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, b.kind === 'rocket' ? 0.5 : 0.25, b.kind === 'rocket' ? 5 : 1.5, b.kind === 'rocket' ? '#2a2a35' : col);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-b.r, -b.r * 0.45, b.r * 2, b.r * 0.9);
        ctx.restore();
        break;
      }
      default: {
        const len = b.r * 3.2 + 6;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.drawImage(glow(col, 32), -len, -b.r * 2.5, len * 2, b.r * 5);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, 0, len * 0.55, b.r * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawEBullets(view, ipos) {
    // one pre-rendered sprite per (style, radius): enemy bullets can number in the hundreds
    const { ctx } = this;
    for (const b of view.ebullets) {
      const p = ipos(b);
      const spr = ebSprite(b.style, b.r);
      ctx.drawImage(spr, p.x - spr.width / 2, p.y - spr.height / 2);
    }
  }

  drawBeams() {
    const { ctx, fx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of fx.beams) {
      const k = 1 - b.t / b.life;
      ctx.strokeStyle = withAlpha(b.color, 0.35 * k);
      ctx.lineWidth = 26 * k;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = withAlpha('#ffffff', k);
      ctx.lineWidth = 5 * k;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    for (const bo of fx.bolts) {
      const k = 1 - bo.t / bo.life;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? withAlpha('#ffffff', k) : withAlpha('#fff27a', 0.5 * k);
        ctx.lineWidth = pass ? 3 : 12 * k;
        ctx.beginPath();
        ctx.moveTo(bo.x, bo.y);
        let cx = bo.x, cy = bo.y;
        for (let i = 1; i <= 9; i++) {
          cy = bo.y - i * 70;
          cx = bo.x + (i === 9 ? 0 : Math.sin(bo.seed + i * 7.1 + pass) * 26);
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }
    for (const a of fx.arcs) {
      const k = 1 - a.t / a.life;
      const pts = a.pts;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? withAlpha('#ffffff', k) : withAlpha('#7ab8ff', 0.5 * k);
        ctx.lineWidth = pass ? 2 : 7;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) {
          const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
          const segs = 5;
          for (let s = 1; s <= segs; s++) {
            const f = s / segs;
            const j = s === segs ? 0 : (Math.sin(a.seed + i * 13 + s * 7 + this.time * 60) * 12);
            const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
            ctx.lineTo(x0 + (x1 - x0) * f + (nx / nl) * j, y0 + (y1 - y0) * f + (ny / nl) * j);
          }
        }
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTexts() {
    const { ctx, fx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of fx.texts) {
      const k = t.t / t.life;
      const pop = t.t < 0.08 ? 1 + (0.08 - t.t) * 8 : 1;
      const size = (t.crit ? 20 : 14) * pop * (t.dim ? 0.8 : 1);
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.5) * (t.dim ? 0.55 : 1);
      ctx.font = `800 ${size | 0}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.crit ? '#ffe066' : '#ffffff';
      ctx.fillText(t.text + (t.crit ? '!' : ''), t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  drawLightmap(view, ipos, localOverride) {
    const { lctx: L, lightC, fx } = this;
    const z = this.cam.zoom * 0.5;
    const W = lightC.width, H = lightC.height;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, W, H);
    L.fillStyle = 'rgba(2,3,10,0.62)';
    L.fillRect(0, 0, W, H);
    L.globalCompositeOperation = 'destination-out';
    L.translate(W / 2, H / 2);
    L.rotate(this.shakeR);
    L.scale(z, z);
    L.translate(-this.cam.x + this.shakeX, -this.cam.y + this.shakeY);
    const spr = this.lightSprite;
    const put = (x, y, r, a = 1) => { L.globalAlpha = a; L.drawImage(spr, x - r, y - r, r * 2, r * 2); };
    for (const p of view.players) {
      const pos = localOverride && p.pid === localOverride.pid ? localOverride : ipos(p);
      put(pos.x, pos.y, p.downed ? 260 : 520, p.connected ? 1 : 0.4);
    }
    for (const l of fx.lights) put(l.x, l.y, l.r, Math.min(1, (l.life / l.max) * 1.5));
    for (const e of view.enemies) if (e.boss || (e.guardian && !e.asleep)) put(e.x, e.y, 320, 0.8);
    for (const q of view.pois || []) put(q.x, q.y, q.state === 2 ? 90 : 190, q.state === 2 ? 0.4 : 0.75);
    if (view.map) for (const b of view.map.obstacles) if (b.kind === 'crystal' && Math.abs(b.x - this.cam.x) < this.w / this.cam.zoom && Math.abs(b.y - this.cam.y) < this.h / this.cam.zoom) put(b.x, b.y, 130, 0.6);
    for (const b of view.bullets) if (b.kind === 'rocket' || b.kind === 'flame') put(b.x, b.y, 70, 0.4);
    L.globalAlpha = 1;
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(lightC, 0, 0, this.w, this.h);
  }
}

const ebCache = new Map();
function ebSprite(style, r) {
  const key = style * 1000 + Math.round(r * 4);
  let c = ebCache.get(key);
  if (c) return c;
  const col = EB_COLORS[style] || '#ff3355';
  const R = Math.ceil(r * 3);
  c = document.createElement('canvas');
  c.width = c.height = R * 2;
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  g.drawImage(glow(col, 32), 0, 0, R * 2, R * 2);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = col;
  g.beginPath(); g.arc(R, R, r, 0, TAU); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(R, R, r * 0.55, 0, TAU); g.fill();
  ebCache.set(key, c);
  return c;
}

function makeLightSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.75)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return c;
}
