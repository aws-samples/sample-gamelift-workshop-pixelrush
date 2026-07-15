#!/usr/bin/env node
// Road-Fighter gameplay browser test: two tabs join the local server, dodge
// with left/right taps, screenshots along the way.
// Usage: node browser-race-test.mjs [frontendUrl] [serverWsUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';

const frontend = process.argv[2] ?? 'http://localhost:5175/';
const serverWs = process.argv[3] ?? 'ws://localhost:1935/';
const shotDir = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const pages = [];
for (let n = 1; n <= 2; n++) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log(`[tab${n} console.error] ${msg.text()}`); });
  page.on('pageerror', (err) => console.log(`[tab${n} pageerror] ${err.message}`));
  const url = `${frontend}?server=${encodeURIComponent(serverWs)}&name=Tab${n}&pid=tab-${n}&psid=local-tab-${n}&car=corolla`;
  await page.goto(url);
  pages.push(page);
}

await new Promise((r) => setTimeout(r, 3000));
await pages[0].screenshot({ path: `${shotDir}rf-joined.png` });

// wait for race start (countdown 3s after wait timeout)
await new Promise((r) => setTimeout(r, 12_000));
await pages[0].screenshot({ path: `${shotDir}rf-start.png` });

// dodge: random left/right taps
const until = Date.now() + 25_000;
while (Date.now() < until) {
  for (const page of pages) {
    const key = Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.press(key);
  }
  await new Promise((r) => setTimeout(r, 500));
}
await pages[0].screenshot({ path: `${shotDir}rf-racing-tab1.png` });
await pages[1].screenshot({ path: `${shotDir}rf-racing-tab2.png` });

const canvasOk = await pages[0].evaluate(() => !!document.querySelector('canvas'));
console.log(`canvas rendered: ${canvasOk}`);
console.log(`screenshots in ${shotDir}`);
await browser.close();
