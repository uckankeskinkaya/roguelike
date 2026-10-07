// Player movement. This function is pure with respect to the fields it touches
// so that network clients can run it for client-side prediction and replay
// unacknowledged inputs after each authoritative snapshot.
import { DT, ARENA_W, ARENA_H, DASH_TICKS, DASH_SPEED, PLAYER_RADIUS, TICK_RATE } from '../config.js';

export const BASE_SPEED = 235;
export const BASE_DASH_CD = 0.85; // seconds
const ACCEL = 16;  // velocity smoothing (1/s): snappy but not robotic

export function dashCooldownTicks(dashCdReduction) {
  return Math.round(BASE_DASH_CD * (1 - dashCdReduction) * TICK_RATE);
}

/**
 * Advances movement state by one tick.
 * m: { x, y, vx, vy, dashT, dashCd, dashDx, dashDy, aimX, aimY, downed }
 * input: { mx, my, dash }
 * Returns 1 if a dash started, 2 if a dash ended, 0 otherwise.
 */
export function stepMovement(m, input, speedMul, dashCdTicks, map = null, dashLen = 0) {
  let result = 0;
  if (m.dashCd > 0) m.dashCd--;
  let mx = input.mx || 0, my = input.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }

  if (m.dashT <= 0 && input.dash && m.dashCd <= 0 && !m.downed) {
    let dx = mx, dy = my;
    if (len < 0.15) { dx = m.aimX; dy = m.aimY; }
    const dl = Math.hypot(dx, dy) || 1;
    m.dashDx = dx / dl; m.dashDy = dy / dl;
    m.dashT = DASH_TICKS + (dashLen || 0);
    m.dashCd = dashCdTicks;
    result = 1;
  }

  if (m.dashT > 0) {
    m.vx = m.dashDx * DASH_SPEED;
    m.vy = m.dashDy * DASH_SPEED;
    m.dashT--;
    if (m.dashT === 0) {
      // keep some momentum out of the dash for a fluid feel
      m.vx *= 0.35; m.vy *= 0.35;
      result = 2;
    }
  } else {
    const sp = BASE_SPEED * speedMul * (m.downed ? 0.3 : 1);
    const tx = mx * sp, ty = my * sp;
    const k = Math.min(1, ACCEL * DT);
    m.vx += (tx - m.vx) * k;
    m.vy += (ty - m.vy) * k;
  }

  m.x += m.vx * DT;
  m.y += m.vy * DT;
  const r = PLAYER_RADIUS;
  if (m.x < r) { m.x = r; m.vx = 0; }
  if (m.x > ARENA_W - r) { m.x = ARENA_W - r; m.vx = 0; }
  if (m.y < r) { m.y = r; m.vy = 0; }
  if (m.y > ARENA_H - r) { m.y = ARENA_H - r; m.vy = 0; }
  if (map) {
    // slide along obstacles: remove the velocity component pointing into them
    const n = map.collide(m, r);
    if (n) {
      const vn = m.vx * n.x + m.vy * n.y;
      if (vn < 0) { m.vx -= vn * n.x; m.vy -= vn * n.y; }
    }
  }
  return result;
}
