#!/usr/bin/env node
// Verifies the password gate + cookie session flow in a real browser:
// 1. wrong password -> stays on Login with error
// 2. correct password -> Lobby, cookie set
// 3. page reload -> auto-resume to Lobby (no login screen)
// 4. switch racer -> cookie cleared, reload lands on Login
// Usage: node browser-login-test.mjs <siteUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';

const site = process.argv[2] ?? 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 960, height: 640 } }); // shared cookies
const page = await ctx.newPage();
page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));

const name = `Cookie${Date.now() % 100000}`;
await page.goto(site);
await page.waitForSelector('#password', { timeout: 15000 });

// 1. wrong password
await page.fill('#name', name);
await page.fill('#password', 'nope');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 2500));
const stillLogin = await page.evaluate(() => window.__game.scene.isActive('Login'));
await page.screenshot({ path: `${shotDir}login-1-wrong-pass.png` });
console.log(`wrong password stays on Login: ${stillLogin}`);

// 2. correct password
await page.fill('#password', 'gamelift');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
console.log('correct password -> Lobby: true');

// 3. reload -> auto-resume
await page.reload();
const resumed = await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 })
  .then(() => true).catch(() => false);
console.log(`reload auto-resumes to Lobby: ${resumed}`);
await page.screenshot({ path: `${shotDir}login-2-resumed.png` });

// 4. switch racer -> Login again after reload
await page.waitForFunction(() => {
  const lobby = window.__game?.scene.getScene('Lobby');
  return lobby?.children?.list?.some((o) => o.type === 'Text' && o.text === 'switch racer');
}, null, { timeout: 15000 });
await page.evaluate(() => {
  // click the "switch racer" button via scene (coordinates vary)
  const lobby = window.__game.scene.getScene('Lobby');
  const btn = lobby.children.list.find((o) => o.type === 'Text' && o.text === 'switch racer');
  btn.emit('pointerdown');
});
await page.waitForFunction(() => window.__game?.scene.isActive('Login'), null, { timeout: 10000 });
await page.reload();
const backToLogin = await page.waitForFunction(() => window.__game?.scene.isActive('Login'), null, { timeout: 20000 })
  .then(() => true).catch(() => false);
console.log(`switch racer + reload lands on Login: ${backToLogin}`);
await browser.close();
