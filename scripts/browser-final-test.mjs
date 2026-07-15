#!/usr/bin/env node
// Final verification on the deployed CloudFront site:
// 1. tab1 logs in -> chat panel shows join message -> sends a chat line
// 2. tab1 Quick Start (1P) on track-1 -> races vs NPC grid on the EC2 fleet
// 3. tab2+tab3 do 2P multiplayer matchmaking -> race together
// Usage: node browser-final-test.mjs <siteUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';

const site = process.argv[2] ?? 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();

async function login(n) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', (err) => console.log(`[tab${n} pageerror] ${err.message}`));
  await page.goto(site);
  await page.waitForSelector('#name', { timeout: 15000 });
  await page.fill('#name', `Final${n}x${Date.now() % 100000}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
  return page;
}

function startMatch(page, size) {
  return page.evaluate((matchSize) => {
    window.__game.scene.getScene('Lobby').scene.start('Matchmaking', { trackId: 'track-1', matchSize });
  }, size);
}

// --- Part 1: chat + quick start ---
const tab1 = await login(1);
await new Promise((r) => setTimeout(r, 2500)); // wait for hello broadcast round-trip
await tab1.screenshot({ path: `${shotDir}final-1-lobby-chat.png` });

// send a chat message
await tab1.fill('#chat-input', 'Hello from the workshop! 大家好');
await tab1.press('#chat-input', 'Enter');
await new Promise((r) => setTimeout(r, 2000));
await tab1.screenshot({ path: `${shotDir}final-2-chat-sent.png` });

// quick start
await startMatch(tab1, 1);
const raceOk = await tab1.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 60000 })
  .then(() => true).catch(() => false);
console.log(`quick start reached race: ${raceOk}`);
await new Promise((r) => setTimeout(r, 8000)); // countdown + some racing
// dodge a bit
for (let i = 0; i < 20; i++) {
  await tab1.keyboard.press(Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight');
  await new Promise((r) => setTimeout(r, 400));
}
await tab1.screenshot({ path: `${shotDir}final-3-quickstart-race.png` });

// --- Part 2: 2P multiplayer ---
const [tab2, tab3] = await Promise.all([login(2), login(3)]);
await Promise.all([startMatch(tab2, 2), startMatch(tab3, 2)]);
const mp = await Promise.all([tab2, tab3].map((t, i) =>
  t.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 90000 })
    .then(() => true).catch(() => { console.log(`tab${i + 2} no race`); return false; })));
console.log(`2P multiplayer both racing: ${mp.every(Boolean)}`);
await new Promise((r) => setTimeout(r, 8000));
await tab2.screenshot({ path: `${shotDir}final-4-2p-race.png` });

// chat visible on tab1's lobby after its race? just final screenshot
await new Promise((r) => setTimeout(r, 3000));
await tab1.screenshot({ path: `${shotDir}final-5-tab1-late.png` });
console.log(`done; screenshots in ${shotDir}`);
await browser.close();
