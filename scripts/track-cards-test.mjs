import { chromium } from 'playwright';
const site = 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = '/Users/ruofeima/code/gamelift-workshop/scripts/shots/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.fill('#name', `Cards${Date.now() % 100000}`);
await page.fill('#password', 'gamelift');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
await page.evaluate(() => window.__game.scene.getScene('Lobby').scene.start('TrackSelect'));
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${shotDir}cards-1-layout.png` });
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
const sx = box.width / 960, sy = box.height / 640;
// hover card 1 (leftmost, contentCx=355; startX = 355 - 482/2 + 75 = 189)
await page.mouse.move(box.x + 106 * sx, box.y + 270 * sy);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${shotDir}cards-2-hover.png` });
// click to select
await page.mouse.click(box.x + 106 * sx, box.y + 270 * sy);
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${shotDir}cards-3-selected.png` });
await browser.close();
console.log('done');
