#!/usr/bin/env node
// Jitter resilience test: a bursty TCP proxy between the browser and the
// local game server delays packets in bursts (like a lossy WiFi link), then
// we measure how smoothly the other car's position advances on screen.
import net from 'node:net';
import { chromium } from 'playwright';

// --- bursty proxy: forwards 1935 -> 1936, pausing 300-500ms every ~800ms ---
const proxy = net.createServer((client) => {
  const upstream = net.connect(1936, '127.0.0.1');
  let paused = [];
  let pausing = false;
  setInterval(() => {
    pausing = true;
    setTimeout(() => {
      pausing = false;
      for (const chunk of paused) client.write(chunk);
      paused = [];
    }, 300 + Math.random() * 200);
  }, 800);
  upstream.on('data', (d) => { if (pausing) paused.push(d); else client.write(d); });
  client.on('data', (d) => upstream.write(d));
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
  upstream.on('error', () => {});
  client.on('error', () => {});
});
proxy.listen(1935);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
await page.goto(`http://localhost:5176/?server=${encodeURIComponent('ws://localhost:1935/')}&name=JitterBot&pid=jit-1&psid=local-jit-1&car=corolla`);
await page.waitForFunction(() => window.__game?.scene.isActive('Race'), null, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 12000)); // countdown + race start

// sample the BOT car's rendered d at 30Hz for 8s; count freezes (no movement
// across consecutive samples while racing) — the stutter signature
const samples = [];
for (let i = 0; i < 240; i++) {
  const d = await page.evaluate(() => {
    const race = window.__game.scene.getScene('Race');
    const s = race?.conn?.interpolated?.();
    const bot = s?.cars?.find((c) => c.isBot);
    return bot?.d ?? null;
  });
  samples.push(d);
  await new Promise((r) => setTimeout(r, 33));
}
let freezes = 0, moves = 0;
for (let i = 1; i < samples.length; i++) {
  if (samples[i] === null || samples[i - 1] === null) continue;
  if (samples[i] - samples[i - 1] <= 0.01) freezes++; else moves++;
}
const freezePct = Math.round((freezes / (freezes + moves)) * 100);
console.log(`bot car frozen in ${freezePct}% of frames under bursty network (moves=${moves}, freezes=${freezes})`);
console.log(freezePct < 15 ? 'SMOOTHING OK' : 'STILL STUTTERING');
await browser.close();
proxy.close();
process.exit(freezePct < 15 ? 0 : 1);
