// Procedural map: obstacles, floor zones and points of interest (structures,
// guardian bosses). Generated purely from the run seed, so the host and every
// client build the identical map without sending it over the network.
import { ARENA_W, ARENA_H } from '../config.js';
import { RNG } from '../rng.js';

// Structure types. Index order is part of the network protocol.
export const POI_TYPES = ['chest', 'fountain', 'shrine', 'pylon', 'totem'];
export const POI_DEFS = {
  chest:    { name: 'Sandık', r: 46, hold: 80, color: '#ffd23f', hint: 'Üstünde dur' },
  fountain: { name: 'Şifa Pınarı', r: 60, hold: 60, color: '#5affc8', hint: 'Üstünde dur: takımı iyileştirir' },
  shrine:   { name: 'Kan Sunağı', r: 62, hold: 110, color: '#ff4d6d', hint: 'Üstünde dur: pusu başlar, ödül büyük' },
  pylon:    { name: 'Enerji Kulesi', r: 110, hold: 90, color: '#4df0ff', charge: 1200, hint: 'Alanda kal ve şarj et' },
  totem:    { name: 'Savaş Totemi', r: 52, hold: 80, color: '#c08bff', hint: 'Üstünde dur: geçici güç' },
};
export const GOLD_COLOR = '#ffb000';
export const GUARDIAN_COLORS = ['#ffb13d', '#5affc8', '#c08bff', '#ff6b8a'];

export function poiName(type, tier) {
  return type === 'chest' && tier ? 'Altın Sandık' : POI_DEFS[type].name;
}

const CELL = 160;
const NORMAL = { x: 0, y: 0 };

export class MapData {
  constructor({ obstacles, pois, zones }) {
    this.obstacles = obstacles;
    this.pois = pois;       // static descriptors: { type, x, y, tier, guard }
    this.zones = zones;
    this.gw = Math.ceil(ARENA_W / CELL) + 1;
    this.gh = Math.ceil(ARENA_H / CELL) + 1;
    this.cells = Array.from({ length: this.gw * this.gh }, () => []);
    for (const b of obstacles) {
      const x0 = Math.max(0, ((b.x - b.r) / CELL) | 0), x1 = Math.min(this.gw - 1, ((b.x + b.r) / CELL) | 0);
      const y0 = Math.max(0, ((b.y - b.r) / CELL) | 0), y1 = Math.min(this.gh - 1, ((b.y + b.r) / CELL) | 0);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.cells[cy * this.gw + cx].push(b);
    }
  }

  // Pushes circle `o` ({x, y}, radius r) out of any obstacle. Returns the last
  // push normal (shared object, copy it if you keep it) or null.
  collide(o, r) {
    let hit = null;
    const x0 = Math.max(0, ((o.x - r) / CELL) | 0), x1 = Math.min(this.gw - 1, ((o.x + r) / CELL) | 0);
    const y0 = Math.max(0, ((o.y - r) / CELL) | 0), y1 = Math.min(this.gh - 1, ((o.y + r) / CELL) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.cells[cy * this.gw + cx];
        for (let i = 0; i < c.length; i++) {
          const b = c[i];
          const dx = o.x - b.x, dy = o.y - b.y;
          const rr = r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2);
          const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0;
          o.x = b.x + nx * rr;
          o.y = b.y + ny * rr;
          NORMAL.x = nx; NORMAL.y = ny;
          hit = NORMAL;
        }
      }
    }
    return hit;
  }

  blocked(x, y, r) {
    const x0 = Math.max(0, ((x - r) / CELL) | 0), x1 = Math.min(this.gw - 1, ((x + r) / CELL) | 0);
    const y0 = Math.max(0, ((y - r) / CELL) | 0), y1 = Math.min(this.gh - 1, ((y + r) / CELL) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.cells[cy * this.gw + cx];
        for (let i = 0; i < c.length; i++) {
          const b = c[i];
          const dx = x - b.x, dy = y - b.y, rr = r + b.r;
          if (dx * dx + dy * dy < rr * rr) return true;
        }
      }
    }
    return false;
  }
}

const ZONE_COLORS = ['#2a5cff', '#ff2a8a', '#2aff9a', '#ffa02a', '#8a2aff'];

export function genMap(seedNum) {
  const rng = new RNG((seedNum ^ 0x5bd1e995) >>> 0);
  const cx = ARENA_W / 2, cy = ARENA_H / 2;
  const M = 160;
  const pois = [];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const place = (type, count, minCenter, minGap, extra = {}) => {
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 400; tries++) {
        const p = { type, x: rng.range(M, ARENA_W - M), y: rng.range(M, ARENA_H - M), tier: 0, guard: -1, ...extra };
        if (Math.hypot(p.x - cx, p.y - cy) < minCenter) continue;
        if (pois.some((q) => dist(p, q) < minGap)) continue;
        pois.push(p);
        break;
      }
    }
  };
  // gold chests first: each is locked behind a sleeping guardian boss
  const goldMinCenter = 950;
  for (let g = 0; g < 3; g++) place('chest', 1, goldMinCenter, 900, { tier: 1, guard: g });
  place('shrine', 3, 500, 560);
  place('pylon', 2, 600, 700);
  place('fountain', 3, 380, 520);
  place('totem', 3, 450, 520);
  place('chest', 6, 350, 380);

  const obstacles = [];
  const clearOf = (x, y, r) => {
    if (Math.hypot(x - cx, y - cy) < 300 + r) return false;
    if (x < r + 20 || y < r + 20 || x > ARENA_W - r - 20 || y > ARENA_H - r - 20) return false;
    for (const p of pois) {
      const keep = (POI_DEFS[p.type].r || 50) + 70 + (p.guard >= 0 ? 190 : 0) + (p.type === 'pylon' ? 60 : 0);
      if (Math.hypot(x - p.x, y - p.y) < keep + r) return false;
    }
    return true;
  };
  const kinds = () => { const k = rng.next(); return k < 0.6 ? 'rock' : k < 0.85 ? 'pillar' : 'crystal'; };
  const add = (x, y, r, kind = kinds()) => {
    if (!clearOf(x, y, r)) return false;
    obstacles.push({ x, y, r, kind, seed: (rng.next() * 1e6) | 0 });
    return true;
  };

  // ruin clusters: overlapping circles read as walls and give cover
  for (let c = 0; c < 10; c++) {
    let bx = 0, by = 0;
    for (let tries = 0; tries < 60; tries++) {
      bx = rng.range(M, ARENA_W - M); by = rng.range(M, ARENA_H - M);
      if (clearOf(bx, by, 60)) break;
    }
    const n = rng.int(4, 8);
    const ang0 = rng.range(0, Math.PI * 2);
    const line = rng.chance(0.5); // some clusters form a wall line instead of a blob
    for (let i = 0; i < n; i++) {
      const r = rng.range(26, 70);
      if (line) {
        const t = (i - n / 2) * 78;
        add(bx + Math.cos(ang0) * t, by + Math.sin(ang0) * t, r);
      } else {
        const a = rng.range(0, Math.PI * 2), d = rng.range(0, 150);
        add(bx + Math.cos(a) * d, by + Math.sin(a) * d, r);
      }
    }
  }
  for (let i = 0; i < 30; i++) add(rng.range(M, ARENA_W - M), rng.range(M, ARENA_H - M), rng.range(24, 56));

  const zones = [];
  for (let i = 0; i < 6; i++) {
    zones.push({ x: rng.range(0, ARENA_W), y: rng.range(0, ARENA_H), r: rng.range(480, 900), color: rng.pick(ZONE_COLORS) });
  }
  return new MapData({ obstacles, pois, zones });
}
