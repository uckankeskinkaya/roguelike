// Presentation-only particle system (never affects the simulation).
import { glow } from './sprites.js';

export const P = { SPARK: 0, DOT: 1, RING: 2, SHARD: 3, SMOKE: 4, GHOST: 5, FLASH: 6 };
const MAX = 3000;

export class Particles {
  constructor() {
    this.list = [];
    this.pool = [];
  }

  clear() { this.pool.push(...this.list); this.list.length = 0; }

  add(type, x, y, vx, vy, life, size, color, extra = 0) {
    if (this.list.length >= MAX) return null;
    const p = this.pool.pop() || {};
    p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.color = color;
    p.drag = 0.9; p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 12;
    p.extra = extra; p.grav = 0;
    this.list.push(p);
    return p;
  }

  burst(x, y, n, color, speed = 300, life = 0.5, size = 3, type = P.SPARK) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.add(type, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.8), size * (0.6 + Math.random() * 0.8), color);
    }
  }

  cone(x, y, ang, spread, n, color, speed, life, size, type = P.SPARK) {
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.add(type, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.7), size, color);
    }
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        this.pool.push(p);
        continue;
      }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  // Draw in world space (ctx already transformed).
  draw(ctx) {
    // normal-blended first (smoke, shards), then additive light
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.list) {
      const t = p.life / p.max;
      if (p.type === P.SMOKE) {
        ctx.globalAlpha = t * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.8 - t), 0, 6.283);
        ctx.fill();
      } else if (p.type === P.SHARD) {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, s * 0.7); ctx.lineTo(-s * 0.4, -s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const t = p.life / p.max;
      switch (p.type) {
        case P.SPARK: {
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * t + 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
          break;
        }
        case P.DOT: {
          const s = p.size * (0.4 + t * 0.6) * 4;
          ctx.globalAlpha = t;
          ctx.drawImage(glow(p.color, 16), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case P.RING: {
          const r = p.size + (p.extra - p.size) * (1 - t * t);
          ctx.globalAlpha = t * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2 + 6 * t;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0, r), 0, 6.283);
          ctx.stroke();
          break;
        }
        case P.GHOST: {
          ctx.globalAlpha = t * 0.45;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.283);
          ctx.fill();
          break;
        }
        case P.FLASH: {
          const s = p.size * (1.2 - t * 0.2);
          ctx.globalAlpha = t * t;
          ctx.drawImage(glow(p.color, 64), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
