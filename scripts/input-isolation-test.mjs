#!/usr/bin/env node
// Input isolation + tap-loss test with 2 clients on one server.
// Phase A (crosstalk): only P1 steers; P2's lane must never change.
// Phase B (tap loss): P1 sends rapid press+release taps (like real keyboard
// taps at ~120ms) and we count how many actually moved the car.
import WebSocket from 'ws';

const url = 'ws://localhost:1939/';
function connect(n) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(url);
    const st = { slot: -1, racing: false, lane: null, lanes: [], sock, seq: 0, lt: 0, rt: 0 };
    sock.on('open', () => sock.send(JSON.stringify({
      t: 'join', playerSessionId: `ps-${n}`, playerId: `iso-${n}`, name: `Iso${n}`, carId: 'corolla',
    })));
    sock.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') { st.slot = m.yourSlot; resolve(st); }
      if (m.t === 'race_start') st.racing = true;
      if (m.t === 'state') {
        const me = m.cars.find((c) => c.slot === st.slot);
        if (me) { st.lane = me.lane; st.lanes.push(me.lane); }
      }
      if (m.t === 'error') reject(new Error(m.reason));
    });
    sock.on('error', reject);
  });
}
const send = (st, useItem = false) => st.sock.send(JSON.stringify({
  t: 'input', seq: st.seq++, lt: st.lt, rt: st.rt, useItem }));
const tap = (st, dir) => { if (dir < 0) st.lt++; else st.rt++; send(st); };

const [p1, p2] = await Promise.all([connect(1), connect(2)]);
console.log(`slots: p1=${p1.slot} p2=${p2.slot}`);
while (!p1.racing) await new Promise((r) => setTimeout(r, 200));
await new Promise((r) => setTimeout(r, 500));

// --- Phase A: crosstalk ---
const p2LaneBefore = Math.round(p2.lane);
for (let i = 0; i < 6; i++) {
  tap(p1, i % 2 === 0 ? 1 : -1);
  await new Promise((r) => setTimeout(r, 280));
}
await new Promise((r) => setTimeout(r, 500));
const p2LaneAfter = Math.round(p2.lane);
console.log(`crosstalk: p2 lane ${p2LaneBefore} -> ${p2LaneAfter} ${p2LaneBefore === p2LaneAfter ? 'ISOLATED ✓' : 'LEAKED ✗'}`);

// --- Phase B: rapid alternating taps — every tap must land ---
await new Promise((r) => setTimeout(r, 300));
const taps = 6;
for (let i = 0; i < taps; i++) {
  tap(p1, i % 2 === 0 ? 1 : -1);
  await new Promise((r) => setTimeout(r, 60)); // much faster than one tick pair
}
await new Promise((r) => setTimeout(r, 600));
// count distinct lane transitions in the recorded stream
let moves = 0;
let prev = null;
for (const l of p1.lanes) {
  const rl = Math.round(l * 10) / 10;
  if (prev !== null && Math.abs(rl - prev) > 0.5) moves++;
  if (Number.isInteger(rl)) prev = rl;
}
console.log(`tap test: ${taps} rapid taps -> ~${moves} lane moves ${moves >= taps - 1 ? 'OK ✓' : 'TAPS LOST ✗'}`);
p1.sock.close(); p2.sock.close();
process.exit(0);
