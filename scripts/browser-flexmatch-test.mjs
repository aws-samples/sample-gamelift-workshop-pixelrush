#!/usr/bin/env node
// Full FlexMatch end-to-end: two headless tabs log in, pick track-1, request
// matchmaking, get matched into the local Anywhere game session, and race.
// Usage: node browser-flexmatch-test.mjs <siteUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';

const site = process.argv[2] ?? 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

// HTTPS page -> ws://127.0.0.1 trips Chrome's Local Network Access check in
// headless mode (real users get a permission prompt, or use the localhost dev
// server for the Anywhere part). Disable for the automated test only.
const browser = await chromium.launch({
  args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks'],
});

async function startTab(n) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', (err) => console.log(`[tab${n} pageerror] ${err.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') console.log(`[tab${n} console.error] ${msg.text()}`); });
  await page.goto(site);
  await page.waitForSelector('#name', { timeout: 15000 });
  await page.fill('#name', `Flex${n}x${Date.now() % 100000}`);
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 2500));

  // Wait for the Lobby scene to be live, then enter Matchmaking through the
  // scene API (coordinate clicks race against async scene creation).
  await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
  await page.evaluate(() => {
    window.__game.scene.getScene('Lobby').scene.start('Matchmaking', { trackId: 'track-1' });
  });
  await page.waitForFunction(() => window.__game?.scene.isActive('Matchmaking'), null, { timeout: 10000 });
  await page.screenshot({ path: `${shotDir}flex-0-matchmaking-tab${n}.png` });
  return page;
}

// Start both tabs ~in parallel so FlexMatch pairs them into one match.
const [tab1, tab2] = await Promise.all([startTab(1), startTab(2)]);
console.log('both tabs requested matchmaking; waiting for match + race...');

// Wait until both tabs are actually in the Race scene (matched + connected).
for (const [i, tab] of [tab1, tab2].entries()) {
  await tab.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 90000 })
    .catch(() => console.log(`tab${i + 1} did not reach Race scene in time`));
}
await new Promise((r) => setTimeout(r, 5000));
await tab1.screenshot({ path: `${shotDir}flex-1-matched.png` });

// Drive both cars so the race visibly progresses.
for (const page of [tab1, tab2]) await page.keyboard.down('ArrowUp');
let dir = 'ArrowLeft';
const until = Date.now() + 20_000;
while (Date.now() < until) {
  for (const page of [tab1, tab2]) await page.keyboard.down(dir);
  await new Promise((r) => setTimeout(r, 400));
  for (const page of [tab1, tab2]) await page.keyboard.up(dir);
  dir = dir === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
  await new Promise((r) => setTimeout(r, 300));
}
await tab1.screenshot({ path: `${shotDir}flex-2-racing-tab1.png` });
await tab2.screenshot({ path: `${shotDir}flex-3-racing-tab2.png` });
console.log(`screenshots in ${shotDir}`);
await browser.close();
