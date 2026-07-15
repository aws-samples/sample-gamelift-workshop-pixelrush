import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5176/?server=${encodeURIComponent('ws://localhost:1936/')}&name=RtcBot&pid=rtc-1&psid=local-rtc-1&car=corolla`);
await page.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 9000));
const status = await page.evaluate(() => {
  const race = window.__game.scene.getScene('Race');
  const conn = race?.conn;
  return {
    dcState: conn?.dc?.readyState ?? 'none',
    lastTick: conn?.lastStateTick ?? -1,
  };
});
console.log(`datachannel: ${status.dcState}, latest tick: ${status.lastTick}`);
await new Promise((r) => setTimeout(r, 1500));
const status2 = await page.evaluate(() => {
  const race = window.__game.scene.getScene('Race');
  return race?.conn?.lastStateTick ?? -1;
});
console.log(`ticks advancing: ${status2 > status.lastTick} (${status.lastTick} -> ${status2})`);
console.log(status.dcState === 'open' && status2 > status.lastTick ? 'RTC OK' : 'RTC NOT ACTIVE');
await browser.close();
