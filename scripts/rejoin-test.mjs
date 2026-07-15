#!/usr/bin/env node
// Rejoin test: player joins, races, socket is forcibly destroyed mid-race
// (like a proxy dropping the TCP), then rejoins with the same playerId.
// Server must reattach the same slot and keep streaming state.
import WebSocket from 'ws';

const url = 'ws://localhost:1938/';
function connect(tag) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(url);
    const st = { slot: -1, racing: false, states: 0, sock };
    sock.on('open', () => sock.send(JSON.stringify({
      t: 'join', playerSessionId: 'ps-1', playerId: 'player-rejoin', name: 'Rejoiner', carId: 'corolla',
    })));
    sock.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') { st.slot = m.yourSlot; console.log(`[${tag}] joined slot=${m.yourSlot} state=${m.raceState}`); resolve(st); }
      if (m.t === 'race_start') st.racing = true;
      if (m.t === 'state') st.states++;
    });
    sock.on('error', () => {}); // destroyed socket errors are expected
  });
}

const first = await connect('conn1');
await new Promise((r) => setTimeout(r, 9000));
console.log(`racing before kill: ${first.racing}`);
first.sock.terminate();
console.log('socket terminated; rejoining in 2s...');
await new Promise((r) => setTimeout(r, 2000));

const second = await connect('conn2');
const sameSlot = second.slot === first.slot;
await new Promise((r) => setTimeout(r, 3000));
const streaming = second.states > 20;
console.log(`REJOIN ${sameSlot && streaming ? 'OK' : 'FAILED'}: slot ${first.slot} -> ${second.slot}, states after rejoin: ${second.states}`);
second.sock.close();
process.exit(sameSlot && streaming ? 0 : 1);
