import { chromium } from 'playwright';
const site = 'https://d3f7s31xicsud5.cloudfront.net';
const shotDir = '/Users/ruofeima/code/gamelift-workshop/scripts/shots/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.fill('#name', `Debug${Date.now() % 100000}`);
await page.fill('#password', 'gamelift');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 25000 });
await new Promise((r) => setTimeout(r, 4000)); // latency probe + join message
// send a player message for the 3-color demo
await page.fill('#chat-input', '大家好，来一局！');
await page.press('#chat-input', 'Enter');
// trigger matchmaking (2P — will wait, giving us the debug request message)
await page.evaluate(() => {
  window.__game.scene.getScene('Lobby').scene.start('Matchmaking', { trackId: 'track-1', matchSize: 2 });
});
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: `${shotDir}debug-chat.png` });
const latencies = await page.evaluate(async () => {
  const mod = await import('/assets/' + performance.getEntriesByType('resource')
    .map((r) => r.name).find((n) => n.includes('index-'))?.split('/assets/')[1]).catch(() => null);
  return 'see console';
});
await browser.close();
console.log('done');
