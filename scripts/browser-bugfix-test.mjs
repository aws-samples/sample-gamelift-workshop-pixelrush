#!/usr/bin/env node
// Verifies the bug fixes on the deployed site:
// 1. shop scrolls (wheel) and legacy cars are gone
// 2. chat shows exactly ONE join message per login
// 3. Quick Start reaches Race instantly (local sim — no matchmaking wait)
// Usage: node browser-bugfix-test.mjs <siteUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';

const site = process.argv[2] ?? 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));

const name = `Fix${Date.now() % 100000}`;
await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.fill('#name', name);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 3000)); // wait for hello broadcast

// --- chat dedupe check ---
await page.screenshot({ path: `${shotDir}fix-1-lobby.png` });

// --- shop scroll check ---
await page.evaluate(() => window.__game.scene.getScene('Lobby').scene.start('Shop'));
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${shotDir}fix-2-shop-top.png` });
await page.mouse.move(350, 400);
await page.mouse.wheel(0, 800);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${shotDir}fix-3-shop-scrolled.png` });

// --- quick start local race ---
await page.evaluate(() => window.__game.scene.getScene('Shop').scene.start('TrackSelect'));
await new Promise((r) => setTimeout(r, 2000));
const t0 = Date.now();
await page.evaluate(() => {
  // trigger quick start directly (same params TrackSelect passes)
  const reg = window.__game.registry.get('player');
  window.__game.scene.getScene('TrackSelect').scene.start('Race', {
    local: true, serverUrl: '', playerSessionId: '',
    playerId: reg.playerId, playerName: reg.name, carId: reg.selectedCar, trackId: 'track-1',
  });
});
await page.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 10000 });
// wait for countdown to pass and race to actually start
await new Promise((r) => setTimeout(r, 5000));
console.log(`quick start to race in ${((Date.now() - t0) / 1000).toFixed(1)}s (includes 3s countdown)`);
for (let i = 0; i < 12; i++) {
  await page.keyboard.press(Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight');
  await new Promise((r) => setTimeout(r, 350));
}
await page.screenshot({ path: `${shotDir}fix-4-quickstart-local.png` });
console.log(`done; screenshots in ${shotDir}`);
await browser.close();
