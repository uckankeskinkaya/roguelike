// Turns simulation events into "juice": particles, shake, flashes, damage
// numbers, banners and sounds. Works identically for host, single-player and
// network clients (clients receive the same events inside snapshots).
import { Particles, P } from './particles.js';
import { sfx, music } from '../audio/sfx.js';
import { WEAPONS } from '../sim/weapons.js';
import { ENEMIES } from '../sim/enemies.js';
import { SKILL_BY_ID } from '../sim/skills.js';
import { POI_TYPES, POI_DEFS, GOLD_COLOR, GUARDIAN_COLORS, poiName } from '../sim/map.js';
import { PLAYER_COLORS } from '../config.js';

export class FX {
  constructor() {
    this.particles = new Particles();
    this.texts = [];
    this.feed = [];
    this.beams = [];
    this.arcs = [];
    this.lights = [];
    this.decals = [];      // queued for the renderer to stamp
    this.trauma = 0;
    this.hurtFlash = 0;
    this.whiteFlash = 0;
    this.banner = null;
    this.kick = 0;         // camera kick (recoil) in aim direction
    this.kickX = 0; this.kickY = 0;
    this.shakeScale = 1;
    this.deviceScale = 1;  // touch/gamepad get gentler shake: small screens amplify it
    this.hitstopMs = 0;    // requested by events; the game loop consumes it
  }

  reset() {
    this.particles.clear();
    this.texts.length = 0; this.feed.length = 0; this.beams.length = 0; this.arcs.length = 0; this.lights.length = 0;
    this.trauma = 0; this.hurtFlash = 0; this.whiteFlash = 0; this.banner = null;
  }

  shake(a) { this.trauma = Math.min(1, this.trauma + a * this.shakeScale * this.deviceScale); }

  showBanner(text, sub = '', color = '#e8f1ff', dur = 2.2) {
    this.banner = { text, sub, color, t: 0, dur };
  }

  pushFeed(text, color, life = 4.5) {
    this.feed.push({ text, color, t: 0, life });
    if (this.feed.length > 5) this.feed.shift();
  }

  light(x, y, r, color, life) { this.lights.push({ x, y, r, color, life, max: life }); }

  // listener: {x, y} of local player for panning/attenuation
  consume(events, localPid, listener) {
    const lx = listener ? listener.x : 0, ly = listener ? listener.y : 0;
    const spatial = (x, y) => {
      const d = Math.hypot(x - lx, y - ly);
      return { vol: Math.max(0.15, 1 - Math.max(0, d - 350) / 900), pan: (x - lx) / 700 };
    };
    const ps = this.particles;
    for (const ev of events) {
      switch (ev[0]) {
        case 'shoot': {
          const [, pid, wid, x, y, a] = ev;
          const w = WEAPONS[wid];
          const mine = pid === localPid;
          ps.cone(x, y, a, 0.5, w.kind === 'flame' ? 1 : 3, w.color, 260, 0.12, 2);
          if (w.kind !== 'flame') ps.add(P.FLASH, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 0, 0, 0.06, 18, w.color);
          if (mine) {
            this.shake(w.shake);
            this.kickX -= Math.cos(a) * w.shake * 14 * this.deviceScale * this.shakeScale;
            this.kickY -= Math.sin(a) * w.shake * 14 * this.deviceScale * this.shakeScale;
            sfx(w.sfx, { vol: 0.9 });
          } else {
            const s = spatial(x, y);
            sfx(w.sfx, { vol: s.vol * 0.4, pan: s.pan });
          }
          break;
        }
        case 'hit': {
          const [, x, y, dmg, crit, pid] = ev;
          const mine = pid === localPid;
          ps.burst(x, y, crit ? 6 : 3, crit ? '#ffe066' : '#ffffff', 280, 0.18, 2);
          // tiny ticks (flames, needles) would bury the screen in digits: sample them
          const show = this.showNumbers !== false && (crit || dmg > 4 || Math.random() < 0.3);
          if (show) this.texts.push({ x: x + (Math.random() - 0.5) * 14, y, vy: -70, t: 0, life: crit ? 0.9 : 0.6, text: String(dmg), crit, dim: !mine });
          if (this.texts.length > 90) this.texts.shift();
          if (mine) sfx(crit ? 'crit' : 'hit', { vol: 0.8, pitch: 0.9 + Math.random() * 0.25 });
          break;
        }
        case 'kill': {
          const [, x, y, type, r, elite] = ev;
          const def = ENEMIES[type];
          const big = r >= 20;
          ps.burst(x, y, big ? 26 : 12, def.color, big ? 420 : 320, 0.45, 2.5);
          ps.burst(x, y, big ? 10 : 5, def.color, 220, 0.6, big ? 7 : 4, P.SHARD);
          ps.add(P.FLASH, x, y, 0, 0, 0.12, r * 3, def.color);
          ps.add(P.RING, x, y, 0, 0, 0.3, r * 0.5, def.color, r * 2.6);
          if (big) ps.burst(x, y, 6, '#1a1c28', 60, 0.9, r * 0.7, P.SMOKE);
          this.decals.push({ x, y, r: r * (big ? 1.8 : 1.4), color: def.color });
          this.light(x, y, r * 6, def.color, 0.25);
          const s = spatial(x, y);
          sfx(big || elite ? 'bigkill' : 'kill', { vol: s.vol * 0.8, pan: s.pan, pitch: 0.85 + Math.random() * 0.3 });
          this.shake(big ? 0.18 : 0.04);
          break;
        }
        case 'boom': {
          const [, x, y, r] = ev;
          ps.burst(x, y, 28, '#ffb347', r * 5, 0.45, 3);
          ps.burst(x, y, 10, '#ff5a2a', r * 2.5, 0.7, 6, P.DOT);
          ps.burst(x, y, 7, '#141420', r * 0.9, 1.0, r * 0.35, P.SMOKE);
          ps.add(P.FLASH, x, y, 0, 0, 0.18, r * 2.4, '#ffd28a');
          ps.add(P.RING, x, y, 0, 0, 0.35, r * 0.3, '#ffb347', r * 1.1);
          this.decals.push({ x, y, r: r * 0.9, color: '#000000', scorch: true });
          this.light(x, y, r * 5, '#ff9a4a', 0.35);
          const s = spatial(x, y);
          sfx('boom', { vol: s.vol, pan: s.pan, pitch: 0.9 + Math.random() * 0.2 });
          this.shake(0.3 * s.vol);
          break;
        }
        case 'beam': {
          const [, x1, y1, x2, y2, pid] = ev;
          const col = WEAPONS.ray.color;
          this.beams.push({ x1, y1, x2, y2, t: 0, life: 0.22, color: col });
          const len = Math.hypot(x2 - x1, y2 - y1);
          for (let i = 0; i < 18; i++) {
            const k = Math.random();
            ps.add(P.DOT, x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.4, 2.5, col);
          }
          if (pid === localPid) this.shake(0.15 + len / 4000);
          break;
        }
        case 'arc': {
          const [, , pts] = ev;
          this.arcs.push({ pts, t: 0, life: 0.16, seed: Math.random() * 1000 });
          for (let i = 2; i < pts.length; i += 2) ps.burst(pts[i], pts[i + 1], 5, '#bfe0ff', 240, 0.2, 2);
          break;
        }
        case 'dash': {
          const [, pid, x, y, dx, dy] = ev;
          ps.cone(x, y, Math.atan2(-dy, -dx), 0.9, 10, PLAYER_COLORS[pid], 260, 0.3, 2);
          ps.add(P.RING, x, y, 0, 0, 0.25, 6, PLAYER_COLORS[pid], 36);
          if (pid === localPid) { sfx('dash'); this.shake(0.06); }
          break;
        }
        case 'nova': {
          const [, pid, x, y, r] = ev;
          ps.add(P.RING, x, y, 0, 0, 0.4, 10, '#7ab8ff', r);
          ps.add(P.RING, x, y, 0, 0, 0.3, 10, '#ffffff', r * 0.8);
          ps.burst(x, y, 24, '#7ab8ff', r * 4, 0.35, 2);
          this.light(x, y, r * 3, '#7ab8ff', 0.3);
          sfx('nova', { vol: pid === localPid ? 1 : 0.4 });
          if (pid === localPid) this.shake(0.2);
          break;
        }
        case 'hurt': {
          const [, pid, x, y] = ev;
          ps.burst(x, y, 14, '#ff3355', 320, 0.4, 2.5);
          if (pid === localPid) {
            this.hurtFlash = 1;
            this.shake(0.55);
            sfx('hurt');
            navigator.vibrate?.(60);
          }
          break;
        }
        case 'loot': {
          const [, pid, kind, id] = ev;
          if (pid !== localPid) break;
          const d = kind === 'w' ? WEAPONS[id] : SKILL_BY_ID[id];
          this.pushFeed(kind === 'w' ? `▲ ${d.name} yükseldi` : `+ ${d.name}`, d.color);
          sfx('loot');
          if (listener) ps.burst(listener.x, listener.y, 16, d.color, 260, 0.6, 3, P.DOT);
          break;
        }
        case 'poiact': {
          const [, , ti, x, y] = ev;
          const type = POI_TYPES[ti], col = POI_DEFS[type].color;
          ps.add(P.RING, x, y, 0, 0, 0.7, 20, col, 260);
          ps.burst(x, y, 24, col, 380, 0.7, 3);
          this.light(x, y, 500, col, 0.5);
          this.shake(0.25);
          sfx('poi');
          if (type === 'shrine') this.showBanner('PUSU!', 'Hepsini temizle: ödül büyük', '#ff4d6d', 1.8);
          else if (type === 'pylon') this.showBanner('KULE ŞARJ OLUYOR', 'Alanda kal ve dayan', '#4df0ff', 1.8);
          break;
        }
        case 'poidone': {
          const [, , ti, x, y, tier] = ev;
          const type = POI_TYPES[ti], col = type === 'chest' && tier ? GOLD_COLOR : POI_DEFS[type].color;
          ps.add(P.RING, x, y, 0, 0, 0.6, 10, col, 180);
          ps.burst(x, y, 36, col, 460, 0.9, 3.5);
          ps.burst(x, y, 10, '#ffffff', 220, 0.8, 4, P.DOT);
          this.light(x, y, 520, col, 0.6);
          this.shake(0.2);
          sfx(type === 'fountain' ? 'heal' : 'chest');
          this.pushFeed(`${poiName(type, tier)} etkinleştirildi`, col, 3.5);
          break;
        }
        case 'wake': {
          const [, x, y, v] = ev;
          const col = GUARDIAN_COLORS[v || 0];
          ps.add(P.RING, x, y, 0, 0, 0.9, 40, col, 420);
          ps.burst(x, y, 40, col, 520, 0.8, 3);
          this.shake(0.7); this.whiteFlash = Math.max(this.whiteFlash, 0.25);
          sfx('boss', { vol: 0.7 });
          this.showBanner('MUHAFIZ UYANDI', 'Ödülü için savaş', col, 2.2);
          break;
        }
        case 'gdead': {
          const [, x, y, v] = ev;
          const col = GUARDIAN_COLORS[v || 0];
          for (let i = 0; i < 3; i++) ps.add(P.RING, x, y, 0, 0, 0.5 + i * 0.2, 20, i % 2 ? '#ffffff' : col, 240 + i * 120);
          ps.burst(x, y, 80, col, 700, 1, 3.5);
          ps.burst(x, y, 24, '#ffd23f', 420, 1.2, 6, P.SHARD);
          this.light(x, y, 700, col, 0.9);
          this.whiteFlash = 0.5; this.shake(0.8);
          sfx('boom', { pitch: 0.7 }); sfx('bigkill', { pitch: 0.6 });
          this.showBanner('MUHAFIZ YENİLDİ', 'Altın sandığın kilidi açıldı', '#ffd23f', 2.4);
          break;
        }
        case 'unlock': break;
        case 'found': {
          const [, , ti, , , tier] = ev;
          const type = POI_TYPES[ti];
          this.pushFeed(`Keşfedildi: ${poiName(type, tier)}`, type === 'chest' && tier ? GOLD_COLOR : POI_DEFS[type].color, 5);
          sfx('loot', { vol: 0.5 });
          break;
        }
        case 'ring': ps.add(P.RING, ev[1], ev[2], 0, 0, 0.7, 30, GUARDIAN_COLORS[ev[3] || 0], 300); this.shake(0.4); sfx('bossphase', { vol: 0.5 }); break;
        case 'stop': this.hitstopMs = Math.max(this.hitstopMs, ev[1]); break;
        case 'down': {
          const [, pid, x, y] = ev;
          ps.burst(x, y, 30, PLAYER_COLORS[pid], 300, 0.8, 3);
          sfx('down');
          if (pid === localPid && !this.solo) this.showBanner('YERE DÜŞTÜN', 'Bir takım arkadaşın yanına gelip seni kaldırabilir', '#ff4d6d', 3);
          break;
        }
        case 'revive': {
          const [, pid, x, y] = ev;
          ps.add(P.RING, x, y, 0, 0, 0.6, 10, '#8cff9e', 90);
          ps.burst(x, y, 20, '#8cff9e', 200, 0.6, 2.5, P.DOT);
          sfx('revive', { vol: pid === localPid ? 1 : 0.6 });
          break;
        }
        case 'heal': {
          const [, pid, x, y] = ev;
          ps.burst(x, y, 10, '#ff4d6d', 120, 0.6, 2.5, P.DOT);
          if (pid === localPid) sfx('heal');
          break;
        }
        case 'xp': if (ev[1] === localPid) sfx('xp'); break;
        case 'levelup': sfx('levelup'); this.levelPulse = 1; break;
        case 'wave': {
          const [, n, boss] = ev;
          this.showBanner(boss ? 'BOSS DALGASI' : `DALGA ${n}`, boss ? 'Kor Gözcü uyanıyor...' : 'Hayatta kal', boss ? '#ff3355' : '#4df0ff', 2.4);
          sfx('wave');
          music.setIntensity(boss ? 3 : 2);
          break;
        }
        case 'waveend': {
          this.showBanner('DALGA TEMİZLENDİ', 'Güçlendirmeni seç', '#7dff6a', 2);
          sfx('waveend');
          music.setIntensity(1);
          this.whiteFlash = 0.3;
          break;
        }
        case 'countdown': sfx('tick'); break;
        case 'boss': sfx('boss'); this.shake(0.6); break;
        case 'bossphase': {
          const [, x, y] = ev;
          this.whiteFlash = 0.7;
          this.shake(0.9);
          ps.add(P.RING, x, y, 0, 0, 0.8, 40, '#ff3355', 520);
          ps.burst(x, y, 60, '#ff3355', 600, 0.8, 3);
          sfx('bossphase');
          this.showBanner('KOR GÖZCÜ ÖFKELENDİ', '', '#ff3355', 2);
          break;
        }
        case 'bossdead': {
          const [, x, y] = ev;
          this.whiteFlash = 1;
          this.shake(1);
          for (let i = 0; i < 4; i++) ps.add(P.RING, x, y, 0, 0, 0.6 + i * 0.25, 20, i % 2 ? '#ffffff' : '#ff3355', 300 + i * 160);
          ps.burst(x, y, 120, '#ff3355', 900, 1.2, 3.5);
          ps.burst(x, y, 40, '#ffd23f', 500, 1.5, 6, P.SHARD);
          this.light(x, y, 900, '#ff6a6a', 1.2);
          sfx('boom', { pitch: 0.6 }); sfx('bigkill', { pitch: 0.5 });
          music.setIntensity(1);
          break;
        }
        case 'eshot': {
          const s = spatial(ev[1], ev[2]);
          sfx('eshot', { vol: s.vol * 0.7, pan: s.pan });
          break;
        }
        case 'ebhit': ps.burst(ev[1], ev[2], 6, '#ff6688', 200, 0.25, 2); break;
        case 'charge': { const s = spatial(ev[1], ev[2]); sfx('charge', { vol: s.vol, pan: s.pan }); break; }
        case 'fuse': { const s = spatial(ev[1], ev[2]); sfx('fuse', { vol: s.vol, pan: s.pan }); break; }
        case 'summon': ps.add(P.RING, ev[1], ev[2], 0, 0, 0.6, 30, '#ff3355', 200); break;
        case 'spawn': {
          const def = ENEMIES[ev[3]];
          ps.burst(ev[1], ev[2], 8, def.color, 160, 0.3, 2);
          if (def.boss) { this.shake(0.8); this.showBanner('KOR GÖZCÜ', 'Ateş çemberlerinden kaç, boşlukları kolla', '#ff3355', 3); }
          break;
        }
        case 'burn': ps.add(P.DOT, ev[1] + (Math.random() - 0.5) * 16, ev[2], 0, -60, 0.4, 2.5, '#ff9a2e'); break;
        case 'horde': this.showBanner('SÜRÜ GELİYOR!', 'Çember daralıyor — atıl!', '#ff9f43', 1.8); sfx('horde'); break;
        case 'pick': if (ev[1] === localPid) sfx('pick'); break;
        case 'gameover': sfx('gameover'); music.setIntensity(0); break;
        case 'victory': sfx('victory'); music.setIntensity(0); break;
      }
    }
  }

  update(dt) {
    this.particles.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.whiteFlash = Math.max(0, this.whiteFlash - dt * 2.2);
    this.levelPulse = Math.max(0, (this.levelPulse || 0) - dt * 1.5);
    const kd = Math.pow(0.0001, dt);
    this.kickX *= kd; this.kickY *= kd;
    for (const f of this.feed) f.t += dt;
    this.feed = this.feed.filter((f) => f.t < f.life);
    for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; t.vy *= Math.pow(0.05, dt); }
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < b.life);
    for (const a of this.arcs) a.t += dt;
    this.arcs = this.arcs.filter((a) => a.t < a.life);
    for (const l of this.lights) l.life -= dt;
    this.lights = this.lights.filter((l) => l.life > 0);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
  }
}
