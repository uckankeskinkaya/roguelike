// Unified input: keyboard+mouse, Gamepad API and touch, with automatic
// switching to whichever device was used last.
const DEAD = 0.2;
const AIM_DEAD = 0.35;
const STICK_R = 60;

function deadzone(x, y, dz) {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k, Math.min(1, (m - dz) / (1 - dz))];
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.device = 'kbm';
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, moved: false };
    this.dashLatch = false;
    this.pauseLatch = false;
    this.onDevice = null;    // (device) => void
    this.onNav = null;       // ('up'|'down'|'left'|'right'|'ok'|'back') => void
    this.onPause = null;
    this.onMap = null;       // toggles the full map
    this.gp = { index: -1, prev: [], navT: 0, lastAxis: '' };
    this.touch = { left: null, right: null, dash: null };
    this.gpMove = [0, 0];
    this.gpAim = [0, 0, 0];
    this.enabled = true;

    const isField = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    addEventListener('keydown', (e) => {
      if (isField(e)) return;
      this.setDevice('kbm');
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashLatch = true;
        if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
        if (e.code === 'KeyM' || e.code === 'Tab') this.onMap?.();
      }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touch = { left: null, right: null, dash: null }; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    // taps on menus also count as "using touch" (for hints and touch controls)
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.setDevice('touch'); }, { capture: true });
    addEventListener('pointermove', (e) => this.pointerMove(e));
    addEventListener('pointerup', (e) => this.pointerUp(e));
    addEventListener('pointercancel', (e) => this.pointerUp(e));
    addEventListener('gamepadconnected', (e) => { this.gp.index = e.gamepad.index; });
    addEventListener('gamepaddisconnected', (e) => {
      if (this.gp.index === e.gamepad.index) this.gp.index = -1;
      if (this.device === 'gamepad') this.setDevice('kbm');
    });
  }

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this.onDevice?.(d);
  }

  dashButton() {
    return { x: innerWidth - 78, y: innerHeight - 82, r: 44 };
  }

  pointerDown(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      this.setDevice('touch');
      e.preventDefault();
      const db = this.dashButton();
      if (Math.hypot(e.clientX - db.x, e.clientY - db.y) < db.r + 14) {
        this.touch.dash = e.pointerId;
        this.dashLatch = true;
        return;
      }
      const side = e.clientX < innerWidth / 2 ? 'left' : 'right';
      if (!this.touch[side]) this.touch[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    } else {
      this.setDevice('kbm');
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 2) this.dashLatch = true;
    }
  }

  pointerMove(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      for (const side of ['left', 'right']) {
        const t = this.touch[side];
        if (t && t.id === e.pointerId) {
          t.x = e.clientX; t.y = e.clientY;
          // floating stick: drag the origin along when pulled too far
          const dx = t.x - t.ox, dy = t.y - t.oy, d = Math.hypot(dx, dy);
          if (d > STICK_R * 1.4) { t.ox = t.x - (dx / d) * STICK_R * 1.4; t.oy = t.y - (dy / d) * STICK_R * 1.4; }
        }
      }
    } else {
      const moved = Math.abs(e.clientX - this.mouse.x) + Math.abs(e.clientY - this.mouse.y);
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (moved > 3 && this.device !== 'kbm' && e.pointerType === 'mouse') this.setDevice('kbm');
    }
  }

  pointerUp(e) {
    for (const side of ['left', 'right']) {
      if (this.touch[side] && this.touch[side].id === e.pointerId) this.touch[side] = null;
    }
    if (this.touch.dash === e.pointerId) this.touch.dash = null;
  }

  // Called once per rendered frame.
  poll(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = this.gp.index >= 0 ? pads[this.gp.index] : null;
    if (!pad) for (const p of pads) if (p && p.connected) { pad = p; this.gp.index = p.index; break; }
    if (!pad) { this.gpMove = [0, 0]; this.gpAim = [0, 0, 0]; return; }

    const btn = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
    const prev = this.gp.prev;
    const edge = (i) => btn(i) && !prev[i];
    const [mx, my] = deadzone(pad.axes[0] || 0, pad.axes[1] || 0, DEAD);
    const aim = deadzone(pad.axes[2] || 0, pad.axes[3] || 0, AIM_DEAD);
    let any = false;
    for (let i = 0; i < pad.buttons.length; i++) if (btn(i)) any = true;
    if (any || Math.hypot(mx, my) > 0.3 || aim[2] > 0.2) this.setDevice('gamepad');

    this.gpMove = [mx, my];
    this.gpAim = aim;
    if (edge(0) || edge(4) || edge(5) || edge(6) || edge(7)) this.dashLatch = true;
    if (edge(9)) this.onPause?.();
    if (edge(8) || edge(3)) this.onMap?.();

    // menu navigation (d-pad / left stick with repeat)
    if (this.onNav) {
      if (edge(0)) this.onNav('ok');
      if (edge(1)) this.onNav('back');
      let dir = '';
      if (btn(12) || my < -0.6) dir = 'up';
      else if (btn(13) || my > 0.6) dir = 'down';
      else if (btn(14) || mx < -0.6) dir = 'left';
      else if (btn(15) || mx > 0.6) dir = 'right';
      if (dir) {
        this.gp.navT -= dt;
        if (dir !== this.gp.lastAxis || this.gp.navT <= 0) {
          this.onNav(dir);
          this.gp.navT = dir === this.gp.lastAxis ? 0.12 : 0.35;
        }
      }
      this.gp.lastAxis = dir;
    }
    this.gp.prev = pad.buttons.map((b, i) => btn(i));
  }

  // Produces the movement/aim intent for one simulation tick.
  // aimFromMouse(sx, sy) -> {x, y} direction in world space (or null)
  sample(aimFromMouse) {
    let mx = 0, my = 0, ax = 0, ay = 0;
    if (this.device === 'kbm') {
      const k = this.keys;
      mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      const l = Math.hypot(mx, my);
      if (l > 0) { mx /= l; my /= l; }
      const a = aimFromMouse ? aimFromMouse(this.mouse.x, this.mouse.y) : null;
      if (a) { ax = a.x; ay = a.y; }
    } else if (this.device === 'gamepad') {
      [mx, my] = this.gpMove;
      if (this.gpAim[2] > 0) { const l = Math.hypot(this.gpAim[0], this.gpAim[1]); ax = this.gpAim[0] / l; ay = this.gpAim[1] / l; }
    } else if (this.device === 'touch') {
      const L = this.touch.left, R = this.touch.right;
      if (L) {
        const dx = (L.x - L.ox) / STICK_R, dy = (L.y - L.oy) / STICK_R;
        [mx, my] = deadzone(Math.max(-1.2, Math.min(1.2, dx)), Math.max(-1.2, Math.min(1.2, dy)), 0.12);
        const l = Math.hypot(mx, my);
        if (l > 1) { mx /= l; my /= l; }
      }
      if (R) {
        const dx = R.x - R.ox, dy = R.y - R.oy, d = Math.hypot(dx, dy);
        if (d > 12) { ax = dx / d; ay = dy / d; }
      }
    }
    const dash = this.dashLatch;
    this.dashLatch = false;
    if (!this.enabled) return { mx: 0, my: 0, ax: 0, ay: 0, dash: false };
    return { mx, my, ax, ay, dash };
  }

  drawTouch(ctx) {
    if (this.device !== 'touch') return;
    const db = this.dashButton();
    ctx.save();
    ctx.globalAlpha = this.touch.dash !== null ? 0.9 : 0.5;
    ctx.fillStyle = 'rgba(169,139,255,0.25)';
    ctx.strokeStyle = '#a98bff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(db.x, db.y, db.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8e0ff';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATIL', db.x, db.y + 5);
    for (const side of ['left', 'right']) {
      const t = this.touch[side];
      if (!t) continue;
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = side === 'left' ? '#4df0ff' : '#ff5ad1';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.ox, t.oy, STICK_R, 0, Math.PI * 2); ctx.stroke();
      const dx = t.x - t.ox, dy = t.y - t.oy, d = Math.hypot(dx, dy), k = d > STICK_R ? STICK_R / d : 1;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.arc(t.ox + dx * k, t.oy + dy * k, 22, 0, Math.PI * 2); ctx.fill();
    }
    if (!this.touch.left && !this.touch.right) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#c9d6ff';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText('sol: hareket', innerWidth * 0.25, innerHeight - 30);
      ctx.fillText('sağ: nişan (boşsa otomatik)', innerWidth * 0.62, innerHeight - 30);
    }
    ctx.restore();
  }
}
