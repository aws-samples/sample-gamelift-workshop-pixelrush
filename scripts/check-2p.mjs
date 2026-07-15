import { chromium } from 'playwright';
const site = 'https://d3f7s31xicsud5.cloudfront.net';
const browser = await chromium.launch();
async function login(n) {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  await page.goto(site);
  await page.waitForSelector('#name', { timeout: 15000 });
  await page.fill('#name', `TwoP${n}x${Date.now() % 100000}`);
  await page.fill('#password', 'gamelift');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 });
  return page;
}
const [a, b] = await Promise.all([login(1), login(2)]);
await Promise.all([a, b].map((t) => t.evaluate(() => {
  window.__game.scene.getScene('Lobby').scene.start('Matchmaking', { trackId: 'track-1', matchSize: 2 });
})));
// wait until both HUDs show a live race (banner hidden = joined + racing)
const results = await Promise.all([a, b].map(async (t, i) => {
  try {
    await t.waitForFunction(() => {
      const race = window.__game?.scene.getScene('Race');
      return window.__game?.scene.isActive('Race') && race?.children?.list?.some(
        (o) => o.type === 'Text' && o.text?.startsWith('POS'));
    }, null, { timeout: 120000 });
    return true;
  } catch { return false; }
}));
console.log(`tab1 racing HUD: ${results[0]}, tab2 racing HUD: ${results[1]}`);
await new Promise((r) => setTimeout(r, 5000));
await a.screenshot({ path: '/Users/ruofeima/code/gamelift-workshop/scripts/shots/2p-verify.png' });
await browser.close();
