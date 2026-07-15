import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('[console]', m.text().slice(0, 120)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5176/?server=${encodeURIComponent('ws://localhost:1936/')}&name=Dbg&pid=dbg-1&psid=local-dbg-1&car=corolla`);
await page.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 20000 });
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(() => {
    const race = window.__game.scene.getScene('Race');
    const conn = race?.conn;
    return {
      dc: conn?.dc?.readyState ?? 'none',
      ws: conn?.sock?.readyState,
      tick: conn?.lastStateTick ?? -1,
      pcState: conn?.pc?.connectionState ?? 'none',
    };
  });
  console.log(JSON.stringify(s));
  await new Promise((r) => setTimeout(r, 2000));
}
await browser.close();
