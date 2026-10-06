// Renders icons/icon.svg to the PNG sizes the PWA manifest needs.
// Usage: node tools/make-icons.mjs   (requires Playwright + Chromium)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];
for (const [name, size, maskable] of jobs) {
  // maskable: full-bleed background, art scaled into the 80% safe zone
  const inner = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#05060c;display:flex;align-items:center;justify-content:center">
         <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:${size * 0.8}px;height:${size * 0.8}px">
       </div>`
    : `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:${size}px;height:${size}px;display:block">`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  await page.waitForTimeout(100);
  const buf = await page.screenshot({ omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), buf);
  console.log('wrote', name);
}
await browser.close();
