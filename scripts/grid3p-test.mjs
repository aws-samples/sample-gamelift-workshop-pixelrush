import { chromium } from 'playwright';
const site = 'https://d3f7s31xicsud5.cloudfront.net';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.fill('#name', `Grid3${Date.now() % 100000}`);
await page.fill('#password', 'gamelift');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 25000 });
await page.evaluate(() => {
  window.__game.scene.getScene('Lobby').scene.start('Matchmaking', { trackId: 'track-1', matchSize: 3 });
});
console.log('requested 3P solo; waiting for 45s expansion + match...');
await page.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 150000 });
// wait for countdown (bots join at countdown) + race start
await new Promise((r) => setTimeout(r, 8000));
const cars = await page.evaluate(() => {
  const race = window.__game.scene.getScene('Race');
  const s = race?.conn?.interpolated?.();
  return s?.cars?.map((c) => ({ slot: c.slot, isBot: c.isBot })) ?? [];
});
console.log('cars in race:', JSON.stringify(cars));
console.log(cars.length === 3 ? 'GRID FILL OK (3 cars)' : `GRID FILL WRONG (${cars.length} cars)`);
await browser.close();
process.exit(cars.length === 3 ? 0 : 1);
