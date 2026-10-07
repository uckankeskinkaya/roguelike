// DOM menus and overlays (touch, mouse and gamepad navigable).
import { WEAPONS, MAX_TIER, TIER_NAMES } from '../sim/weapons.js';
import { SKILL_BY_ID } from '../sim/skills.js';
import { iconCanvas } from '../render/icons.js';
import { PLAYER_COLORS } from '../config.js';
import { sfx } from '../audio/sfx.js';

export const $ = (id) => document.getElementById(id);

const SCREENS = ['scr-menu', 'scr-join', 'scr-lobby', 'scr-pause', 'scr-over', 'scr-settings', 'scr-help'];

export class UI {
  constructor() {
    this.current = null;
    this.stack = [];
    this.cardSig = '';
    this.onBack = {};
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) sfx('click');
      if (b && b.hasAttribute('data-back')) this.back();
    });
    document.addEventListener('pointerover', (e) => {
      const b = e.target.closest('button, .card');
      if (b && e.pointerType === 'mouse') sfx('hover');
    });
  }

  show(id, push = false) {
    if (push && this.current) this.stack.push(this.current);
    else if (!push) this.stack = [];
    this.display(id);
  }

  display(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    this.current = id;
    if (id) this.focusFirst();
  }

  hideAll() { this.show(null); }

  back() {
    const handler = this.onBack[this.current];
    if (handler) { handler(); return; }
    const prev = this.stack.pop();
    this.display(prev || 'scr-menu');
  }

  // ------------------------------------------------------------ focus/nav
  focusables() {
    let root = null;
    if (!$('scr-pick').hidden) root = $('scr-pick');
    else if (this.current) root = $(this.current);
    if (!root) return [];
    return [...root.querySelectorAll('button:not([disabled]), input, .card, summary')].filter((el) => el.offsetParent !== null);
  }

  focusFirst() {
    const f = this.focusables();
    const prim = f.find((el) => el.classList.contains('primary')) || f.find((el) => el.tagName === 'BUTTON' || el.classList.contains('card'));
    this.setFocus(prim || null, false);
  }

  setFocus(el, sound = true) {
    for (const x of document.querySelectorAll('.focus')) x.classList.remove('focus');
    this.focused = el;
    if (!el) return;
    el.classList.add('focus');
    if (this.gamepadMode) el.focus({ preventScroll: false });
    if (sound) sfx('hover');
  }

  nav(dir) {
    const f = this.focusables();
    if (!f.length) return false;
    if (dir === 'ok') {
      const el = this.focused && f.includes(this.focused) ? this.focused : null;
      if (el) {
        if (el.tagName === 'INPUT' && el.type === 'range') return true;
        el.click();
      }
      return true;
    }
    if (dir === 'back') { if (this.current && this.current !== 'scr-menu') this.back(); return true; }
    let i = f.indexOf(this.focused);
    const el = this.focused;
    if (el && el.tagName === 'INPUT' && el.type === 'range' && (dir === 'left' || dir === 'right')) {
      const step = parseFloat(el.step) || 0.1;
      el.value = String(parseFloat(el.value) + (dir === 'right' ? step : -step));
      el.dispatchEvent(new Event('input'));
      return true;
    }
    if (i < 0) i = 0;
    else i = (i + (dir === 'down' || dir === 'right' ? 1 : -1) + f.length) % f.length;
    this.setFocus(f[i]);
    return true;
  }

  toast(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    $('toast').appendChild(d);
    setTimeout(() => d.remove(), 3300);
  }

  netStatus(msg) {
    const el = $('netstatus');
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  // ------------------------------------------------------------ lobby
  renderLobby(list, code, isHost) {
    $('lobby-code').textContent = code || '-----';
    const ul = $('lobby-list');
    ul.innerHTML = '';
    list.forEach((p, i) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      const name = document.createElement('span');
      name.textContent = p.name;
      li.append(dot, name);
      if (p.host) {
        const t = document.createElement('span');
        t.className = 'tagh'; t.textContent = 'HOST';
        li.append(t);
      }
      ul.append(li);
    });
    $('btn-start').hidden = !isHost;
    $('lobby-note').textContent = isHost
      ? (list.length < 2 ? 'Arkadaşlarına oda kodunu ya da davet linkini gönder. Tek başına da başlatabilirsin.' : `${list.length} oyuncu hazır. Başlatınca herkes oyuna girer.`)
      : 'Host\'un oyunu başlatması bekleniyor…';
  }

  // ------------------------------------------------------------ cards
  // Level-ups, chests and the starter weapon all use the same overlay. The game is
  // frozen (by the simulation) while anybody has a pick pending.
  updatePick(view, me, onPick) {
    const pick = $('scr-pick');
    const wait = $('pick-wait');
    if (!view || !me) {
      if (!pick.hidden) { pick.hidden = true; this.cardSig = ''; }
      wait.hidden = true;
      return false;
    }
    const mine = me.picks > 0 && me.choices && me.choices.length > 0;
    if (!mine) {
      if (!pick.hidden) { pick.hidden = true; this.cardSig = ''; }
      const others = view.players.filter((p) => p.connected && p.picks > 0).map((p) => p.name);
      wait.hidden = others.length === 0;
      if (others.length) {
        const t = Math.ceil((view.pickTimer || 0) / 60);
        wait.textContent = `Oyun durdu · seçim yapanlar: ${others.join(', ')}${t > 0 && t < 100 ? `  ·  ${t} sn` : ''}`;
      }
      return false;
    }
    wait.hidden = true;
    const sig = JSON.stringify(me.choices) + me.picks + me.weapons.length;
    if (sig !== this.cardSig) {
      this.cardSig = sig;
      this.buildCards(view, me, onPick);
    }
    pick.hidden = false;
    const t = Math.ceil((view.pickTimer || 0) / 60);
    $('pick-sub').textContent = (me.weapons.length === 0
      ? 'Başlangıç silahını seç'
      : `Oyun durdu · ${me.picks} seçim hakkın var`) + (t > 0 && t < 100 ? ` · ${t} sn` : '');
    return true;
  }

  buildCards(view, me, onPick) {
    $('pick-title').textContent = me.weapons.length === 0 ? 'SİLAHINI SEÇ' : 'GÜÇLENDİRME SEÇ';
    const box = $('cards');
    box.innerHTML = '';
    me.choices.forEach((c, i) => {
      const el = document.createElement('button');
      el.className = 'card';
      const key = document.createElement('span');
      key.className = 'key'; key.textContent = String(i + 1);
      const kind = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'name';
      const desc = document.createElement('span');
      desc.className = 'desc';
      const stat = document.createElement('span');
      stat.className = 'stat';
      if (c.t === 'w') {
        const def = WEAPONS[c.id];
        const owned = me.weapons.find((w) => w.id === c.id);
        kind.className = 'kind ' + (owned ? 'up' : 'new');
        kind.textContent = owned ? `Silah yükseltme ${TIER_NAMES[owned.tier]} → ${TIER_NAMES[Math.min(MAX_TIER, owned.tier + 1)]}` : 'Yeni silah';
        name.textContent = def.name;
        name.style.color = def.color;
        desc.textContent = def.desc;
        stat.textContent = owned ? '+45% hasar · -8% bekleme' : `Hasar ${def.damage}${def.count > 1 ? ' ×' + def.count : ''} · ${(1 / def.cooldown).toFixed(1)}/sn`;
        el.style.borderColor = def.color + '66';
      } else {
        const s = SKILL_BY_ID[c.id];
        const n = (me.skills && me.skills[c.id]) || 0;
        kind.className = 'kind';
        kind.textContent = `Yetenek ${n + 1}/${s.max}`;
        name.textContent = s.name;
        name.style.color = s.color;
        desc.textContent = s.desc;
        el.style.borderColor = s.color + '55';
      }
      el.append(key, iconCanvas(c, 64), kind, name, desc, stat);
      el.addEventListener('click', () => {
        if (el.disabled) return;
        for (const b of box.querySelectorAll('.card')) b.disabled = true;
        // if the (remote) host ignores the pick, don't leave the cards locked
        setTimeout(() => { if (el.isConnected) for (const b of box.querySelectorAll('.card')) b.disabled = false; }, 1500);
        onPick(i);
      });
      box.append(el);
    });
    // build summary
    const b = $('pick-build');
    b.innerHTML = '';
    this.fillBuild(b, me);
    this.focusFirst();
  }

  fillBuild(el, me) {
    el.innerHTML = '';
    for (const w of me.weapons) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.style.borderColor = WEAPONS[w.id].color + '88';
      c.innerHTML = `${WEAPONS[w.id].name} <b>${TIER_NAMES[w.tier]}</b>`;
      el.append(c);
    }
    for (const id in me.skills || {}) {
      const s = SKILL_BY_ID[id];
      if (!s) continue;
      const c = document.createElement('span');
      c.className = 'chip';
      c.innerHTML = `${s.icon} ${s.name} <b>×${me.skills[id]}</b>`;
      el.append(c);
    }
  }
}
