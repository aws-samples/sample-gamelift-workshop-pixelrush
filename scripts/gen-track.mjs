#!/usr/bin/env node
// Generates a lane-dodger track JSON: a straight road of `length` units with
// obstacle rows (parked cars / barriers / slow traffic) and item pickups.
// Difficulty comes from baseSpeed (scroll speed) and obstacle density.
// Deterministic via seed so server and client stay in sync.
// Usage: node gen-track.mjs <spec.json> <out.json>
import fs from 'node:fs';

const [, , specPath, outPath] = process.argv;
if (!specPath || !outPath) {
  console.error('usage: gen-track.mjs <spec.json> <out.json>');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const {
  id, name, length, baseSpeed,
  lanes = 5, laneWidth = 80,
  gapMin = 260, gapMax = 480,        // distance between obstacle rows
  maxPerRow = 2,                     // obstacles per row (must be < lanes)
  movingRatio = 0.3,                 // fraction of obstacles that are slow traffic
  itemEvery = 1200,                  // item pickup spacing
  seed = 1,
} = spec;

// mulberry32 PRNG — deterministic across runs
function rng(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(seed);
const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const obstacles = [];
let d = 500; // clear runway after the start line
let idc = 0;
while (d < length - 300) {
  const count = randInt(1, Math.min(maxPerRow, lanes - 1)); // always ≥1 free lane
  const usedLanes = new Set();
  while (usedLanes.size < count) usedLanes.add(randInt(0, lanes - 1));
  for (const lane of usedLanes) {
    const moving = rand() < movingRatio;
    obstacles.push({
      id: idc++,
      d: Math.round(d + randInt(-30, 30)),
      lane,
      // NPC blockers crawl forward slowly (15-30% of track speed): the player
      // closes in fast and must dodge — Road Fighter style rolling roadblocks.
      speed: moving ? Math.round(baseSpeed * (0.15 + rand() * 0.15)) : 0,
      type: moving ? 'traffic' : 'barrier',
    });
  }
  d += randInt(gapMin, gapMax);
}

const items = [];
for (let pos = itemEvery, i = 0; pos < length - 400; pos += itemEvery, i++) {
  // avoid lanes blocked at this distance
  const blocked = new Set(obstacles.filter(o => Math.abs(o.d - pos) < 120).map(o => o.lane));
  const free = [...Array(lanes).keys()].filter(l => !blocked.has(l));
  items.push({ id: i, d: pos, lane: free[randInt(0, free.length - 1)] });
}

const track = { id, name, length, baseSpeed, lanes, laneWidth, obstacles, items };
fs.writeFileSync(outPath, JSON.stringify(track));
console.log(`${outPath}: length=${length} speed=${baseSpeed} obstacles=${obstacles.length} items=${items.length}`);
