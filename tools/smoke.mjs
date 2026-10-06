// Browser smoke test: starts a single-player run, plays a bit, saves screenshots.
// Usage: node tools/smoke.mjs [outDir]   (expects the game served at http://localhost:8080)
import { chromium } from 'playwright';
const out = process.argv[2] || '.';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:8080/');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/01-menu.png` });
await page.click('#btn-solo');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/02-pick.png` });
await page.keyboard.press('Digit1');
await page.waitForTimeout(3500);
await page.mouse.move(900, 300);
await page.keyboard.down('KeyD');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyD');
await page.keyboard.down('KeyW');
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');
await page.screenshot({ path: `${out}/03-wave.png` });
const state = await page.evaluate(() => {
  const s = window.__nk.G.sim;
  return { phase: s.phase, wave: s.wave, enemies: s.enemies.length, hp: s.players[0].hp, weapons: s.players[0].weapons.map(w => w.id), kills: s.kills };
});
console.log(JSON.stringify(state));
// speed things up: make player invincible and jump to the boss
await page.evaluate(() => {
  const s = window.__nk.G.sim;
  s.players[0].iframes = 1e9;
  s.players[0].weapons.push({ id: 'ray', tier: 3, cd: 0 }, { id: 'simsek', tier: 2, cd: 0 }, { id: 'roket', tier: 2, cd: 0 });
  s.wave = 4; s.waveTicks = 1;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/04-pick2.png` });
await page.keyboard.press('Digit2');
await page.waitForTimeout(500);
for (let i = 0; i < 3; i++) { await page.keyboard.press('Digit1'); await page.waitForTimeout(300); }
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/05-boss.png` });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/06-boss2.png` });
const st2 = await page.evaluate(() => { const s = window.__nk.G.sim; return { phase: s.phase, wave: s.wave, enemies: s.enemies.length, eb: s.ebullets.length, boss: s.bossId, picks: s.players[0].picks }; });
console.log(JSON.stringify(st2));
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log('fps', fps);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
