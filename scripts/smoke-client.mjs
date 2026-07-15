#!/usr/bin/env node
// Smoke test for the Road-Fighter-style sim: connects 2 players, dodges
// obstacles with simple lane logic, expects both to finish.
// Usage: node smoke-client.mjs [ws://localhost:1935/] [track-1]
import WebSocket from 'ws';
import fs from 'node:fs';

const url = process.argv[2] ?? 'ws://localhost:1935/';
const trackId = process.argv[3] ?? 'track-1';
const TIMEOUT_MS = 150_000;

const track = JSON.parse(fs.readFileSync(new URL(`../server/game/tracksdata/${trackId}.json`, import.meta.url), 'utf8'));

function connectPlayer(n) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(url);
    const state = { name: `bot-${n}`, slot: -1, lastState: null, results: null, racing: false };
    sock.on('open', () => {
      sock.send(JSON.stringify({
        t: 'join', playerSessionId: `local-${n}`, playerId: `player-${n}`,
        name: state.name, carId: 'corolla',
      }));
    });
    sock.on('message', (data) => {
      const m = JSON.parse(data.toString());
      switch (m.t) {
        case 'joined':
          state.slot = m.yourSlot;
          console.log(`[${state.name}] joined slot=${m.yourSlot} track=${m.trackId}`);
          resolve({ sock, state });
          break;
        case 'race_start': state.racing = true; if (n === 1) console.log('race started'); break;
        case 'state': state.lastState = m; break;
        case 'event':
          if (n === 1 && ['crash', 'player_finish', 'bomb_hit'].includes(m.kind)) {
            console.log(`event: ${m.kind} slot=${m.slot}`);
          }
          break;
        case 'results':
          state.results = m;
          console.log(`[${state.name}] RESULTS: ${JSON.stringify(m.standings.map(s => [s.name, s.position, s.timeMs]))}`);
          break;
        case 'error': reject(new Error(`server error: ${m.reason}`)); break;
      }
    });
    sock.on('error', reject);
  });
}

const players = await Promise.all([connectPlayer(1), connectPlayer(2)]);

// Dodge driver: if an obstacle (static from track data, or moving from
// snapshot traffic) is ahead in my lane, steer to a free adjacent lane.
// Steering is edge-triggered server-side, so send one press then release.
let seq = 0;
const pressed = new Map(); // slot -> remaining release ticks
function blocked(lane, d, ahead, traffic) {
  for (const o of track.obstacles) {
    if (o.lane !== lane || o.speed > 0) continue;
    if (o.d > d - 60 && o.d < d + ahead) return true;
  }
  for (const t of traffic ?? []) {
    if (t.lane !== lane) continue;
    if (t.d > d - 60 && t.d < d + ahead) return true;
  }
  return false;
}

const driver = setInterval(() => {
  for (const { sock, state } of players) {
    if (!state.racing || !state.lastState) continue;
    const me = state.lastState.cars.find(c => c.slot === state.slot);
    if (!me || me.finished) continue;

    let steer = 0;
    const rel = pressed.get(state.slot) ?? 0;
    if (rel > 0) {
      pressed.set(state.slot, rel - 1); // release phase
    } else {
      const lane = Math.round(me.lane);
      const ahead = track.baseSpeed * 1.2;
      if (blocked(lane, me.d, ahead, state.lastState.traffic)) {
        const leftOK = lane > 0 && !blocked(lane - 1, me.d, ahead, state.lastState.traffic);
        const rightOK = lane < track.lanes - 1 && !blocked(lane + 1, me.d, ahead, state.lastState.traffic);
        steer = leftOK ? -1 : rightOK ? 1 : 0;
        if (steer !== 0) pressed.set(state.slot, 3);
      }
    }
    sock.send(JSON.stringify({ t: 'input', seq: seq++, steer, useItem: !!me.item }));
  }
}, 50);

const deadline = Date.now() + TIMEOUT_MS;
const poll = setInterval(() => {
  const allDone = players.every(p => p.state.results);
  if (allDone || Date.now() > deadline) {
    clearInterval(poll);
    clearInterval(driver);
    for (const { sock } of players) sock.close();
    if (allDone) {
      const s = players[0].state.results.standings;
      const finished = s.filter(x => x.finished).length;
      console.log(`SMOKE OK: ${s.length} standings, ${finished} finished`);
      process.exit(0);
    } else {
      const me = players[0].state.lastState?.cars?.find(c => c.slot === players[0].state.slot);
      console.log(`SMOKE TIMEOUT. last car state: ${JSON.stringify(me)}`);
      process.exit(1);
    }
  }
}, 500);
