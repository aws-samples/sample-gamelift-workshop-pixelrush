#!/usr/bin/env node
// Walks the deployed lobby flow in a headless browser: login -> lobby ->
// garage -> shop -> track select -> leaderboard. Screenshots each screen.
// Usage: node browser-lobby-test.mjs <siteUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';

const site = process.argv[2] ?? 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') console.log(`[console.error] ${msg.text()}`); });

await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.fill('#name', `Lobby${Date.now() % 10000}`);
await page.screenshot({ path: `${shotDir}lobby-1-login.png` });
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${shotDir}lobby-2-lobby.png` });

// Phaser text buttons aren't DOM elements; click by canvas coordinates.
// Lobby buttons: RACE(200) GARAGE(280) SHOP(350) LEADERBOARD(420) at center x=480.
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
const click = async (x, y) => {
  await page.mouse.click(box.x + x * (box.width / 960), box.y + y * (box.height / 640));
  await new Promise((r) => setTimeout(r, 1800));
};

await click(480, 280); // GARAGE
await page.screenshot({ path: `${shotDir}lobby-3-garage.png` });
await click(70, 604);  // back
await click(480, 350); // SHOP
await page.screenshot({ path: `${shotDir}lobby-4-shop.png` });
await click(70, 604);  // back
await click(480, 200); // RACE -> TrackSelect
await page.screenshot({ path: `${shotDir}lobby-5-tracks.png` });
await click(70, 604);  // back
await click(480, 420); // LEADERBOARD
await page.screenshot({ path: `${shotDir}lobby-6-leaderboard.png` });

console.log(`done; screenshots in ${shotDir}`);
await browser.close();
