// Pure-local Quick Start: runs the Road-Fighter sim in the browser against
// NPC drivers — no server, no matchmaking, instant start. Mirrors the
// GameConnection interface so RaceScene is agnostic about the backend.
// Physics constants mirror server/game/sim.go; results are NOT written to the
// leaderboard (practice mode) — multiplayer races remain server-authoritative.

import type { CarState, StateMsg, PlayerInfo, Standing } from './net';

const TICK_MS = 50;
const LANE_CHANGE_TIME = 0.16;
const CAR_HALF = 14, OBSTACLE_HALF = 16, ITEM_HALF = 28;
const LANE_TOLERANCE = 0.45;
const CRASH_SLOWDOWN = 0.35, CRASH_RECOVERY = 1.8;
const NITRO_DURATION = 3, NITRO_FACTOR = 1.4;
const STUN_DURATION = 1.2, BOMB_ARM = 0.4, BOMB_LIFE = 8;
const ITEM_RESPAWN_TICKS = 15 * (1000 / TICK_MS);
const DT = TICK_MS / 1000;

interface TrackData {
  id: string; length: number; baseSpeed: number; lanes: number;
  obstacles: { id: number; d: number; lane: number; speed: number; type: string }[];
  items: { id: number; d: number; lane: number }[];
}

const CAR_SPECS: Record<string, { speedBonus: number; handling: number }> = {
  'compact-blue': { speedBonus: 0.98, handling: 1.05 }, 'sedan-white': { speedBonus: 1.0, handling: 1.0 },
  'coupe-navy': { speedBonus: 1.04, handling: 0.92 }, 'roadster-silver': { speedBonus: 1.05, handling: 0.95 },
  'sports-red': { speedBonus: 1.08, handling: 0.85 }, 'supercar-red': { speedBonus: 1.11, handling: 0.82 },
  'supercar-green': { speedBonus: 1.13, handling: 0.84 }, 'hypercar-darkblue': { speedBonus: 1.15, handling: 0.88 },
};
const BOT_NAMES = ['Turbo-Bot', 'Drift-Bot', 'Nitro-Bot', 'Speedy-Bot', 'Racer-Bot'];
const BOT_CARS = ['sedan-white', 'compact-blue', 'coupe-navy', 'sports-red', 'roadster-silver'];

interface LocalCar {
  slot: number; name: string; carId: string; isBot: boolean;
  d: number; lane: number; laneF: number;
  pendingTaps: number; useItem: boolean;
  item: string; nitroT: number; stunT: number; slowT: number;
  finished: boolean; finishTick: number; pos: number;
}

export class LocalRace {
  private track!: TrackData;
  private cars: LocalCar[] = [];
  private bombs: { id: number; d: number; lane: number; age: number; owner: number }[] = [];
  private bombSeq = 0;
  private takenAt = new Map<number, number>();
  private tick = 0;
  private timer?: number;
  private phase: 'countdown' | 'racing' | 'done' = 'countdown';
  private lastState!: StateMsg;

  onJoined?: (m: { yourSlot: number; trackId: string; players: PlayerInfo[]; raceState: string }) => void;
  onRoster?: (players: PlayerInfo[]) => void;
  onCountdown?: (secondsLeft: number) => void;
  onRaceStart?: () => void;
  onEvent?: (m: { kind: string; slot: number; data?: string }) => void;
  onResults?: (m: { trackId: string; standings: Standing[] }) => void;
  onError?: (reason: string) => void;
  onClose?: () => void;

  // One NPC rival: the challenge comes from traffic dodging, and a full bot
  // grid buries the player's car under rival sprites.
  async start(trackId: string, playerName: string, carId: string, botCount = 1): Promise<void> {
    const res = await fetch(`/tracks/${trackId}.json`);
    this.track = await res.json();

    this.cars.push(this.makeCar(0, playerName, carId, false));
    for (let i = 0; i < botCount; i++) {
      this.cars.push(this.makeCar(i + 1, BOT_NAMES[i % BOT_NAMES.length], BOT_CARS[i % BOT_CARS.length], true));
    }
    this.snapshot();

    // mimic the server handshake so RaceScene flows identically
    setTimeout(() => {
      this.onJoined?.({ yourSlot: 0, trackId, players: this.roster(), raceState: 'countdown' });
      let count = 3;
      this.onCountdown?.(count);
      const cd = setInterval(() => {
        count--;
        if (count > 0) {
          this.onCountdown?.(count);
        } else {
          clearInterval(cd);
          this.phase = 'racing';
          this.onRaceStart?.();
          this.timer = window.setInterval(() => this.step(), TICK_MS);
        }
      }, 1000);
    }, 50);
  }

  private makeCar(slot: number, name: string, carId: string, isBot: boolean): LocalCar {
    // player (slot 0) starts center lane; bots alternate outward (mid±1, mid±2)
    const mid = Math.floor(this.track.lanes / 2);
    const offset = Math.ceil(slot / 2) * (slot % 2 === 1 ? -1 : 1);
    const lane = Math.max(0, Math.min(this.track.lanes - 1, mid + offset));
    return {
      slot, name, carId, isBot, d: 0, lane, laneF: lane,
      pendingTaps: 0, useItem: false,
      item: '', nitroT: 0, stunT: 0, slowT: 0,
      finished: false, finishTick: 0, pos: slot + 1,
    };
  }

  private roster(): PlayerInfo[] {
    return this.cars.map((c) => ({
      slot: c.slot, playerId: c.isBot ? '' : 'local', name: c.name,
      carId: c.carId, connected: true, isBot: c.isBot,
    }));
  }

  /** One tap = one lane change, applied on the next local tick. */
  tap(dir: -1 | 1): void {
    const me = this.cars[0];
    if (!me) return;
    me.pendingTaps += dir;
  }

  sendInput(useItem: boolean): void {
    const me = this.cars[0];
    if (!me) return; // input can arrive before start() finishes loading the track
    if (useItem) me.useItem = true;
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  interpolated(): StateMsg | null {
    return this.lastState ?? null;
  }

  // ---- sim (transliterated from server/game/sim.go) ----

  private step(): void {
    this.tick++;
    for (const c of this.cars) {
      if (c.isBot) this.driveBot(c);
      this.stepCar(c);
    }
    this.stepBombs();
    this.rank();
    this.snapshot();
    if (this.phase === 'racing' && this.cars[0].finished) {
      // player done: give bots 3s to trickle in, then finish
      this.phase = 'done';
      setTimeout(() => this.finish(), 3000);
    }
  }

  private stepCar(c: LocalCar): void {
    if (c.finished) { c.d += this.track.baseSpeed * 0.5 * DT; return; }
    if (c.stunT > 0) { c.stunT -= DT; return; }
    if (c.nitroT > 0) c.nitroT -= DT;
    if (c.slowT > 0) c.slowT -= DT;

    const spec = CAR_SPECS[c.carId] ?? { speedBonus: 1, handling: 1 };
    if (c.pendingTaps !== 0) {
      c.lane = Math.max(0, Math.min(this.track.lanes - 1, c.lane + c.pendingTaps));
      c.pendingTaps = 0;
    }

    const slide = DT / (LANE_CHANGE_TIME * spec.handling);
    const diff = c.lane - c.laneF;
    c.laneF = Math.abs(diff) <= slide ? c.lane : c.laneF + Math.sign(diff) * slide;

    let speed = this.track.baseSpeed * spec.speedBonus;
    if (c.nitroT > 0) speed *= NITRO_FACTOR;
    if (c.slowT > 0) {
      const frac = 1 - c.slowT / CRASH_RECOVERY;
      speed *= CRASH_SLOWDOWN + (1 - CRASH_SLOWDOWN) * frac;
    }
    const oldD = c.d;
    c.d += speed * DT;

    if (c.useItem && c.item) this.useItem(c);
    c.useItem = false;

    if (c.slowT <= 0) {
      for (const o of this.track.obstacles) {
        if (Math.abs(c.laneF - o.lane) > LANE_TOLERANCE) continue;
        const od = this.obstacleD(o);
        if (c.d + CAR_HALF > od - OBSTACLE_HALF && oldD - CAR_HALF < od + OBSTACLE_HALF) {
          c.slowT = CRASH_RECOVERY;
          c.d = od - OBSTACLE_HALF - CAR_HALF;
          this.onEvent?.({ kind: 'crash', slot: c.slot, data: o.type });
          break;
        }
      }
    }

    for (const it of this.track.items) {
      if (it.lane !== Math.round(c.laneF)) continue;
      const t = this.takenAt.get(it.id);
      if (t !== undefined && this.tick - t < ITEM_RESPAWN_TICKS) continue;
      if (Math.abs(c.d - it.d) < ITEM_HALF + CAR_HALF) {
        this.takenAt.set(it.id, this.tick);
        c.item = Math.random() < 0.5 ? 'nitro' : 'bomb';
        this.onEvent?.({ kind: 'item_pickup', slot: c.slot, data: c.item });
        break;
      }
    }

    if (c.d >= this.track.length) {
      c.finished = true;
      c.finishTick = this.tick;
      this.onEvent?.({ kind: 'player_finish', slot: c.slot });
    }
  }

  private obstacleD(o: { d: number; speed: number }): number {
    if (o.speed <= 0) return o.d;
    return (o.d + o.speed * this.tick * DT) % this.track.length;
  }

  private laneBlocked(lane: number, from: number, dist: number): boolean {
    for (const o of this.track.obstacles) {
      if (o.lane !== lane) continue;
      const od = this.obstacleD(o);
      if (od > from - CAR_HALF && od < from + dist) return true;
    }
    return false;
  }

  private driveBot(c: LocalCar): void {
    if (c.finished || c.stunT > 0) return;
    const lookahead = this.track.baseSpeed * 1.1;
    const lane = Math.round(c.laneF);
    if (this.laneBlocked(lane, c.d, lookahead) && c.laneF === c.lane && Math.random() < 0.9) {
      const leftOK = lane > 0 && !this.laneBlocked(lane - 1, c.d, lookahead);
      const rightOK = lane < this.track.lanes - 1 && !this.laneBlocked(lane + 1, c.d, lookahead);
      const dir = leftOK && rightOK ? (Math.random() < 0.5 ? -1 : 1) : leftOK ? -1 : rightOK ? 1 : 0;
      if (dir !== 0) c.lane = lane + dir;
    }
    if (c.item && Math.random() < 0.02) c.useItem = true;
  }

  private useItem(c: LocalCar): void {
    if (c.item === 'nitro') {
      c.nitroT = NITRO_DURATION;
    } else if (c.item === 'bomb') {
      this.bombs.push({ id: ++this.bombSeq, d: c.d - CAR_HALF * 3, lane: Math.round(c.laneF), age: 0, owner: c.slot });
    }
    this.onEvent?.({ kind: 'item_use', slot: c.slot, data: c.item });
    c.item = '';
  }

  private stepBombs(): void {
    this.bombs = this.bombs.filter((b) => {
      b.age += DT;
      if (b.age >= BOMB_ARM) {
        for (const c of this.cars) {
          if (c.slot === b.owner || c.finished || c.stunT > 0) continue;
          if (Math.round(c.laneF) === b.lane && Math.abs(c.d - b.d) < CAR_HALF * 2.5) {
            c.stunT = STUN_DURATION;
            this.onEvent?.({ kind: 'bomb_hit', slot: c.slot });
            return false;
          }
        }
      }
      return b.age < BOMB_LIFE;
    });
  }

  private rank(): void {
    const sorted = [...this.cars].sort((a, b) => {
      const ka = a.finished ? 1e12 - a.finishTick : a.d;
      const kb = b.finished ? 1e12 - b.finishTick : b.d;
      return kb - ka;
    });
    sorted.forEach((c, i) => { c.pos = i + 1; });
  }

  private snapshot(): void {
    const cars: CarState[] = this.cars.map((c) => ({
      slot: c.slot, d: c.d, lane: c.laneF, pos: c.pos, item: c.item,
      nitroActive: c.nitroT > 0, stunned: c.stunT > 0, crashed: c.slowT > 0,
      finished: c.finished, isBot: c.isBot,
    }));
    this.lastState = {
      t: 'state', tick: this.tick, cars,
      traffic: this.track.obstacles.filter((o) => o.speed > 0)
        .map((o) => ({ id: o.id, d: this.obstacleD(o), lane: o.lane })),
      bombs: this.bombs.map((b) => ({ id: b.id, d: b.d, lane: b.lane, armed: b.age >= BOMB_ARM })),
      takenItems: [...this.takenAt.entries()]
        .filter(([, t]) => this.tick - t < ITEM_RESPAWN_TICKS).map(([id]) => id),
    };
  }

  private finish(): void {
    this.close();
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTick - b.finishTick;
      return b.d - a.d;
    });
    const standings: Standing[] = sorted.map((c, i) => ({
      slot: c.slot, playerId: c.isBot ? '' : 'local', name: c.name,
      position: i + 1, timeMs: c.finished ? c.finishTick * TICK_MS : 0,
      finished: c.finished, isBot: c.isBot,
    }));
    this.onResults?.({ trackId: this.track.id, standings });
  }
}
