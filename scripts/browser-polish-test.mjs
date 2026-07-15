#!/usr/bin/env node
// Screenshots the polished TrackSelect (card select effect) and a local Quick
// Start race with nitro active, against the deployed site.
// Usage: node browser-polish-test.mjs <siteUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';

const site = process.argv[2] ?? 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));

await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.fill('#name', `Polish${Date.now() % 100000}`);
await page.fill('#password', 'gamelift');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });

// TrackSelect: click first card, check highlight + mode bar
await page.evaluate(() => window.__game.scene.getScene('Lobby').scene.start('TrackSelect'));
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${shotDir}polish-1-tracks.png` });
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
// first card center (contentCx=355 scaled, y=130)
await page.mouse.click(box.x + 355 * (box.width / 960), box.y + 130 * (box.height / 640));
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${shotDir}polish-2-track-selected.png` });

// Quick Start via mode bar
await page.evaluate(() => {
  const reg = window.__game.registry.get('player');
  window.__game.scene.getScene('TrackSelect').scene.start('Race', {
    local: true, serverUrl: '', playerSessionId: '',
    playerId: reg.playerId, playerName: reg.name, carId: reg.selectedCar, trackId: 'track-1',
  });
});
await page.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 10000 });
await new Promise((r) => setTimeout(r, 6000)); // countdown + racing
// grab nitro if possible; dodge for a while, press space periodically
for (let i = 0; i < 25; i++) {
  await page.keyboard.press(Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight');
  if (i % 5 === 0) await page.keyboard.press('Space');
  await new Promise((r) => setTimeout(r, 350));
}
await page.screenshot({ path: `${shotDir}polish-3-race.png` });

// wait for finish + results (fixed distance, ~45s total)
const gotResults = await page.waitForFunction(() => window.__game?.scene.isActive('Results'), null, { timeout: 90000 })
  .then(() => true).catch(() => false);
console.log(`results screen reached: ${gotResults}`);
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${shotDir}polish-4-results.png` });
console.log(`done; screenshots in ${shotDir}`);
await browser.close();
