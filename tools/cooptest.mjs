// Co-op test: one host page + N client pages over real WebRTC (PeerJS broker).
// Usage: node tools/cooptest.mjs [outDir] [clients]
import { chromium } from 'playwright';
const out = process.argv[2] || '.';
const nClients = +(process.argv[3] || 1);
// optional local signaling server, e.g. 127.0.0.1:9000/
const SIG = process.env.SIGNAL ? `sinyal=${encodeURIComponent(process.env.SIGNAL)}` : '';
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const errors = [];
async function mkPage(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] PAGEERROR ${e.message}\n${e.stack}`));
  return page;
}
const host = await mkPage('host');
await host.goto(`http://localhost:8080/?${SIG}`);
await host.fill('#in-name', 'Hostçu');
await host.click('#btn-host');
await host.waitForFunction(() => window.__nk.G.code && !document.getElementById('scr-lobby').hidden, null, { timeout: 20000 });
const code = await host.evaluate(() => window.__nk.G.code);
console.log('room', code);

const clients = [];
for (let i = 0; i < nClients; i++) {
  const c = await mkPage('c' + i);
  await c.goto(`http://localhost:8080/?oda=${code}&${SIG}`);
  await c.fill('#in-name-join', 'Misafir' + i);
  await c.click('#btn-join-go');
  clients.push(c);
}
for (const c of clients) await c.waitForFunction(() => !document.getElementById('scr-lobby').hidden, null, { timeout: 30000 });
await host.waitForTimeout(500);
await host.screenshot({ path: `${out}/c-lobby-host.png` });
console.log('lobby:', await host.evaluate(() => [...document.querySelectorAll('#lobby-list li')].map((l) => l.textContent).join(' | ')));
await host.click('#btn-start');
for (const c of clients) await c.waitForFunction(() => window.__nk.G.cw && window.__nk.G.cw.snaps.length > 5, null, { timeout: 15000 });
await clients[0].waitForTimeout(800);
await clients[0].screenshot({ path: `${out}/c-client-pick.png` });
// everyone picks
await host.keyboard.press('Digit1');
for (const c of clients) await c.keyboard.press('Digit2');
await host.waitForTimeout(3500);
// client moves around + dashes
const c0 = clients[0];
await c0.mouse.move(800, 200);
await c0.keyboard.down('KeyA');
await c0.waitForTimeout(800);
await c0.keyboard.press('Space');
await c0.waitForTimeout(800);
await c0.keyboard.up('KeyA');
await c0.waitForTimeout(2500);
await c0.screenshot({ path: `${out}/c-client-wave.png` });
await host.screenshot({ path: `${out}/c-host-wave.png` });
const hs = await host.evaluate(() => { const s = window.__nk.G.sim; return { phase: s.phase, wave: s.wave, players: s.players.map((p) => ({ pid: p.pid, name: p.name, x: Math.round(p.x), y: Math.round(p.y), w: p.weapons.map((w) => w.id), seq: p.lastSeq, conn: p.connected })) }; });
const cs = await c0.evaluate(() => { const cw = window.__nk.G.cw; const v = cw.view(performance.now()); return { pid: cw.localPid, pred: cw.pred && { x: Math.round(cw.pred.x), y: Math.round(cw.pred.y) }, err: [cw.errX.toFixed(1), cw.errY.toFixed(1)], hist: cw.history.length, phase: v.phase, enemies: v.enemies.length, rtt: Math.round(window.__nk.G.net.rtt) }; });
console.log('host', JSON.stringify(hs));
console.log('client', JSON.stringify(cs));

// disconnect test: close client 0's page abruptly; host should mark it disconnected
await c0.context().close();
await host.waitForTimeout(8000);
console.log('after drop', JSON.stringify(await host.evaluate(() => window.__nk.G.sim.players.map((p) => [p.name, p.connected]))));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
