import { chromium } from 'playwright';
const site = 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = '/Users/ruofeima/code/gamelift-workshop/scripts/shots/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.fill('#name', `Icon${Date.now() % 100000}`);
await page.fill('#password', 'gamelift');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
// shop shows all 8 cars incl. corolla
await page.evaluate(() => window.__game.scene.getScene('Lobby').scene.start('Shop'));
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${shotDir}icon-1-shop.png` });
// quick start with corolla (most templates own it; force via garage skip — just race)
await page.evaluate(() => {
  const reg = window.__game.registry.get('player');
  window.__game.scene.getScene('Shop').scene.start('Race', {
    local: true, serverUrl: '', playerSessionId: '',
    playerId: reg.playerId, playerName: reg.name, carId: 'corolla', trackId: 'track-1',
  });
});
await page.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 10000 });
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: `${shotDir}icon-2-race.png` });
await browser.close();
console.log('done');
