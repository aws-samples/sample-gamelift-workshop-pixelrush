import { chromium } from 'playwright';
const site = 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = '/Users/ruofeima/code/gamelift-workshop/scripts/shots/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.fill('#name', `Layout${Date.now() % 100000}`);
await page.fill('#password', 'gamelift');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
for (const [scene, shot] of [['Shop', 'layout-1-shop'], ['Garage', 'layout-2-garage'], ['Leaderboard', 'layout-3-board']]) {
  await page.evaluate((s) => {
    const cur = window.__game.scene.getScenes(true)[0];
    cur.scene.start(s);
  }, scene);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${shotDir}${shot}.png` });
}
await browser.close();
console.log('done');
