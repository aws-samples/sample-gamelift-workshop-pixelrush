#!/usr/bin/env node
// Verifies item mechanics in a live race: tracks pickup/use events and item
// state over ~60s of auto-driving, confirming multiple pickups + nitro effect.
import { chromium } from 'playwright';
import fs from 'node:fs';

const frontend = process.argv[2] ?? 'http://localhost:5175/';
const serverWs = process.argv[3] ?? 'ws://localhost:1935/';
const shotDir = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));
await page.goto(`${frontend}?server=${encodeURIComponent(serverWs)}&name=ItemBot&pid=item-1&psid=local-item-1&car=corolla`);

await page.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 20000 });
// wait for race start
await new Promise((r) => setTimeout(r, 14000));

// drive along item lanes and use items when held
const stats = { pickups: 0, uses: { nitro: 0, bomb: 0 }, sawNitroActive: false, sawSpeedBoost: false };
let lastD = 0, normalSpeed = 0;
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const me = await page.evaluate(() => {
    const race = window.__game?.scene.getScene('Race');
    const s = race?.conn?.interpolated?.();
    const mySlot = race?.mySlot ?? -1;
    return s?.cars?.find((c) => c.slot === mySlot) ?? null;
  });
  if (me) {
    const speed = (me.d - lastD) / 0.4;
    lastD = me.d;
    if (!me.nitroActive && speed > 0) normalSpeed = Math.max(normalSpeed, speed);
    if (me.nitroActive) {
      stats.sawNitroActive = true;
      if (speed > normalSpeed * 1.15) stats.sawSpeedBoost = true;
    }
    if (me.item) {
      stats.pickups++;
      stats.uses[me.item] = (stats.uses[me.item] ?? 0) + 1;
      await page.keyboard.press('Space');
    }
    if (me.finished) break;
  }
  // simple dodge: random steering keeps us moving through lanes with items
  await page.keyboard.press(Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight');
  await new Promise((r) => setTimeout(r, 400));
}
await page.screenshot({ path: `${shotDir}items-final.png` });
console.log(JSON.stringify(stats));
const ok = stats.pickups >= 2 && stats.sawNitroActive;
console.log(ok ? 'ITEM TEST OK (multiple pickups + nitro active)' : 'ITEM TEST INCOMPLETE');
await browser.close();
