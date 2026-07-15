import { chromium } from 'playwright';
const site = 'https://d3f7s31xicsud5.cloudfront.net';
const browser = await chromium.launch();
async function login(n) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  await page.goto(site);
  await page.waitForSelector('#name', { timeout: 15000 });
  await page.fill('#name', `Udp${n}x${Date.now() % 100000}`);
  await page.fill('#password', 'gamelift');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
  return page;
}
const [a, b] = await Promise.all([login(1), login(2)]);
await Promise.all([a, b].map((t) => t.evaluate(() => {
  window.__game.scene.getScene('Lobby').scene.start('Matchmaking', { trackId: 'track-1', matchSize: 2 });
})));
await Promise.all([a, b].map((t) =>
  t.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 120000 })));
await new Promise((r) => setTimeout(r, 10000));
for (const [i, t] of [a, b].entries()) {
  const s = await t.evaluate(() => {
    const conn = window.__game.scene.getScene('Race')?.conn;
    return { dc: conn?.dc?.readyState ?? 'none', tick: conn?.lastStateTick ?? -1 };
  });
  console.log(`tab${i + 1}: datachannel=${s.dc} tick=${s.tick}`);
}
await browser.close();
