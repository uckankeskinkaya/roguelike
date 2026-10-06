// Procedurally generated, cached sprites (no external image assets).
const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Soft radial glow, used additively for bullets, particles and lights.
export function glow(color, radius = 32) {
  const key = `g|${color}|${radius}`;
  let c = cache.get(key);
  if (c) return c;
  const s = radius * 2;
  c = makeCanvas(s, s);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grd.addColorStop(0, color);
  grd.addColorStop(0.25, withAlpha(color, 0.55));
  grd.addColorStop(0.6, withAlpha(color, 0.12));
  grd.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  cache.set(key, c);
  return c;
}

export function withAlpha(hex, a) {
  if (hex.startsWith('rgba') || hex.startsWith('hsla')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mix(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

// Arena floor tile: dark plates, faint grid and noise.
export function floorTile() {
  let c = cache.get('floor');
  if (c) return c;
  const S = 256;
  c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#0b0d16';
  g.fillRect(0, 0, S, S);
  // noise speckles (deterministic)
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const v = 14 + rnd() * 18;
    g.fillStyle = `rgba(${v},${v + 4},${v + 18},${0.25 + rnd() * 0.35})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // plates
  g.strokeStyle = 'rgba(90,110,180,0.10)';
  g.lineWidth = 2;
  for (let i = 0; i <= S; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
  }
  g.strokeStyle = 'rgba(90,110,180,0.05)';
  g.lineWidth = 1;
  for (let i = 32; i <= S; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
  }
  // rivets
  g.fillStyle = 'rgba(120,140,210,0.18)';
  for (let x = 0; x <= S; x += 64) for (let y = 0; y <= S; y += 64) g.fillRect(x - 2, y - 2, 4, 4);
  // occasional glyph etching
  g.strokeStyle = 'rgba(77,240,255,0.05)';
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(160, 96, 18, 0, Math.PI * 1.5); g.stroke();
  g.beginPath(); g.moveTo(40, 200); g.lineTo(80, 200); g.lineTo(96, 216); g.stroke();
  cache.set('floor', c);
  return c;
}
