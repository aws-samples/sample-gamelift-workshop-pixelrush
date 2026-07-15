import { chromium } from 'playwright';
const site = 'https://d3f7s31xicsud5.cloudfront.net';
const studentApi = 'https://ie2eyy4lfj.execute-api.us-east-1.amazonaws.com';
const shotDir = '/Users/ruofeima/code/gamelift-workshop/scripts/shots/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(site);
await page.waitForSelector('#name', { timeout: 15000 });
await page.screenshot({ path: `${shotDir}arena-1-login.png` });

// switch to MY SERVER, paste the "student" api url
await page.click('#arena-custom');
await page.fill('#server-url', studentApi);
await page.fill('#name', `Arena${Date.now() % 100000}`);
await page.fill('#password', 'gamelift');
await page.screenshot({ path: `${shotDir}arena-2-custom.png` });
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 25000 });
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: `${shotDir}arena-3-lobby.png` });
const arena = await page.evaluate(() => localStorage.getItem('pixelrush_arena'));
console.log('stored arena:', arena);

// reload: cookie session + custom arena must both survive
await page.reload();
const resumed = await page.waitForFunction(() => window.__game?.scene.isActive('Lobby'), null, { timeout: 20000 })
  .then(() => true).catch(() => false);
console.log('reload resumes on custom arena:', resumed);
await browser.close();
