import Phaser from 'phaser';
import { GameConnection, type Standing, type StateMsg } from '../net';
import { pageFrame } from './ui';
import { LocalRace } from '../localrace';
import { SLOT_COLORS } from './BootScene';
import { audio } from '../audio';

// Road-Fighter-style renderer: the player's car stays near the bottom of the
// screen, the straight road scrolls downward at track speed, and everything
// else (obstacles, traffic, items, rivals) is drawn relative to my distance.

interface TrackData {
  id: string; name: string; length: number; baseSpeed: number;
  lanes: number; laneWidth: number;
  obstacles: { id: number; d: number; lane: number; speed: number; type: string }[];
  items: { id: number; d: number; lane: number }[];
}

interface RaceParams {
  serverUrl: string; playerSessionId: string; playerId: string;
  playerName: string; carId: string; trackId: string;
  /** true = Quick Start: run the sim locally vs NPCs, no server. */
  local?: boolean;
}

const MY_SCREEN_Y = 500;  // my car's fixed screen y

const THEMES: Record<string, { ground: number; road: number; stripe: number }> = {
  'track-1': { ground: 0x2d6a4f, road: 0x3d405b, stripe: 0xf2e9e4 },
  'track-2': { ground: 0x1d4e6b, road: 0x40495a, stripe: 0xffe066 },
  'track-3': { ground: 0x10002b, road: 0x2c096c, stripe: 0xff6ec7 },
  'track-4': { ground: 0x6f1d1b, road: 0x2b2118, stripe: 0xffb627 },
};

export class RaceScene extends Phaser.Scene {
  private conn!: GameConnection | LocalRace;
  private params!: RaceParams;
  private track!: TrackData;
  private mySlot = -1;
  private racing = false;
  private namesBySlot = new Map<number, string>();
  private carsBySlot = new Map<number, string>();

  private roadG!: Phaser.GameObjects.Graphics;
  private carSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private nameLabels = new Map<number, Phaser.GameObjects.Text>();
  private obstacleSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private itemSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private flameSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private bombSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private aKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private hud!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.Text;
  private inputTimer = 0;
  private useItemQueued = false;
  /** Client-predicted target lane for my car (server reconciles on conflict). */
  private predictedLane: number | null = null;
  /** Locally animated lane position sliding toward predictedLane. */
  private predictedLaneF = 0;
  private lastRenderAt = 0;
  private lastTapAt = 0;

  constructor() { super('Race'); }

  init(params: RaceParams): void {
    this.params = params;
    this.mySlot = -1;
    this.racing = false;
    this.namesBySlot.clear();
    this.carSprites.clear(); this.nameLabels.clear(); this.obstacleSprites.clear();
    this.itemSprites.clear(); this.flameSprites.clear(); this.bombSprites.clear();
  }

  create(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.aKey = this.input.keyboard!.addKey('A');
    this.dKey = this.input.keyboard!.addKey('D');
    this.spaceKey = this.input.keyboard!.addKey('SPACE');
    this.spaceKey.on('down', () => { this.useItemQueued = true; });

    // Zero-latency steering: each keydown is one tap — sent immediately as a
    // cumulative counter (lossless server-side), plus local lane prediction
    // so the sprite moves this frame.
    const press = (dir: -1 | 1) => {
      this.conn?.tap(dir);
      if (this.racing && this.predictedLane !== null) {
        const next = Math.round(this.predictedLane) + dir;
        if (next >= 0 && next < (this.track?.lanes ?? 5)) this.predictedLane = next;
        this.lastTapAt = performance.now();
      }
    };
    this.cursors.left.on('down', () => press(-1));
    this.cursors.right.on('down', () => press(1));
    this.aKey.on('down', () => press(-1));
    this.dKey.on('down', () => press(1));

    this.roadG = this.add.graphics().setDepth(0);

    this.hud = this.add.text(12, 12, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      backgroundColor: '#00000088', padding: { x: 8, y: 6 },
    }).setDepth(100);
    this.progressBar = this.add.graphics().setDepth(100);

    this.banner = this.add.text(this.scale.width / 2, 280, 'Connecting...', {
      fontFamily: 'monospace', fontSize: '48px', color: '#ffd60a', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(100);

    pageFrame(this);

    this.connectToServer();
  }

  private async loadTrack(trackId: string): Promise<void> {
    const key = `track-${trackId}`;
    if (!this.cache.json.has(key)) {
      const res = await fetch(`/tracks/${trackId}.json`);
      this.cache.json.add(key, await res.json());
    }
    this.track = this.cache.json.get(key);
  }

  private connectToServer(): void {
    this.conn = this.params.local ? new LocalRace() : new GameConnection();
    this.conn.onJoined = (m) => {
      this.mySlot = m.yourSlot;
      for (const p of m.players) {
        this.namesBySlot.set(p.slot, p.name);
        this.carsBySlot.set(p.slot, p.carId);
      }
      this.banner.setText('Waiting for players...');
      void this.loadTrack(m.trackId);
    };
    this.conn.onRoster = (players) => {
      this.namesBySlot.clear();
      for (const p of players) {
        this.namesBySlot.set(p.slot, p.name);
        this.carsBySlot.set(p.slot, p.carId);
      }
    };
    this.conn.onCountdown = (s) => {
      this.banner.setText(`${s}`).setVisible(true);
      if (s === 3) audio.engineStart();
    };
    this.conn.onRaceStart = () => {
      this.racing = true;
      this.banner.setText('GO!');
      audio.startMusic();
      this.time.delayedCall(800, () => this.banner.setVisible(false));
    };
    this.conn.onEvent = (m) => {
      if (m.kind === 'crash') {
        // wobble any car that crashes on screen; shake only for mine
        this.crashWobble(m.slot);
        if (m.slot === this.mySlot) {
          this.cameras.main.shake(180, 0.012);
          audio.crash();
        }
        return;
      }
      if (m.kind === 'bomb_hit') {
        this.crashWobble(m.slot);
        if (m.slot === this.mySlot) {
          this.cameras.main.shake(280, 0.02);
          audio.crash();
        }
        return;
      }
      if (m.slot !== this.mySlot) return;
      if (m.kind === 'item_pickup') {
        audio.pickup();
      } else if (m.kind === 'player_finish') {
        this.flashBanner('FINISHED!');
      }
    };
    this.conn.onResults = (m) => {
      audio.stopMusic();
      this.conn.close();
      this.scene.start('Results', { standings: m.standings, mySlot: this.mySlot, params: this.params });
    };
    this.conn.onError = (reason) => this.banner.setText(`Error: ${reason}`).setVisible(true);
    this.conn.onClose = () => { if (!this.racing) this.banner.setText('Disconnected').setVisible(true); };
    if (!(this.conn instanceof LocalRace)) {
      this.conn.onReconnecting = () => this.banner.setText('Reconnecting...').setVisible(true);
      // successful rejoin: the joined handler above re-fires — hide the banner
      const origJoined = this.conn.onJoined!;
      this.conn.onJoined = (m) => {
        origJoined(m);
        if (this.racing) this.banner.setVisible(false);
      };
    }

    if (this.conn instanceof LocalRace) {
      void this.conn.start(this.params.trackId, this.params.playerName, this.params.carId);
    } else {
      this.conn.connect(this.params.serverUrl, {
        playerSessionId: this.params.playerSessionId,
        playerId: this.params.playerId,
        name: this.params.playerName,
        carId: this.params.carId,
      });
    }
  }

  private flashBanner(text: string): void {
    this.banner.setText(text).setVisible(true).setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 250, ease: 'Back.out' });
    this.time.delayedCall(1200, () => this.banner.setVisible(false));
  }

  /** Crash feedback: the car fishtails — quick rotation wobble + side skid. */
  private crashWobble(slot: number): void {
    const sprite = this.carSprites.get(slot);
    if (!sprite) return;
    this.tweens.add({
      targets: sprite,
      rotation: { from: -0.45, to: 0.45 },
      duration: 90, yoyo: true, repeat: 3,
      onComplete: () => sprite.setRotation(0),
    });
  }

  update(_time: number, deltaMs: number): void {
    const state = this.conn?.interpolated();
    if (state && this.track) this.render(state);

    // Keep-alive sampler: taps fire on keydown edges (see create); this
    // re-delivers the cumulative counters + queued item use at 20Hz so a
    // dropped frame can never lose input.
    this.inputTimer += deltaMs;
    if (this.inputTimer >= 50) {
      this.inputTimer = 0;
      this.conn.sendInput(this.useItemQueued);
      this.useItemQueued = false;
    }
  }

  // ---- rendering ----

  private roadLeft(): number {
    return (this.scale.width - this.track.lanes * this.track.laneWidth) / 2;
  }

  private laneToX(lane: number): number {
    return this.roadLeft() + (lane + 0.5) * this.track.laneWidth;
  }

  /** World distance -> screen y, relative to my car's distance. */
  private dToY(d: number, myD: number): number {
    return MY_SCREEN_Y - (d - myD);
  }

  private render(state: StateMsg): void {
    const me = state.cars.find((c) => c.slot === this.mySlot);
    const myD = me?.d ?? 0;

    this.drawRoad(myD);
    if (me?.nitroActive) this.drawSpeedLines(myD);
    this.drawObstacles(state, myD);
    this.drawItems(state, myD);
    this.drawBombs(state, myD);
    this.drawCars(state, myD);

    if (me) {
      const total = state.cars.length;
      this.hud.setText(
        `POS ${me.pos}/${total}  ${Math.min(100, Math.floor((me.d / this.track.length) * 100))}%` +
        `  ITEM: ${me.item ? (me.item === 'nitro' ? '🔥nitro' : '💣bomb') + ' (SPACE)' : '-'}` +
        `${me.nitroActive ? '  ⚡NITRO!' : ''}${me.stunned ? '  💫STUNNED' : ''}${me.crashed ? '  💥CRASH!' : ''}`,
      );
      this.drawProgress(state);
    }
  }

  private drawRoad(myD: number): void {
    const g = this.roadG;
    const theme = THEMES[this.track.id] ?? THEMES['track-1'];
    const w = this.scale.width, h = this.scale.height;
    g.clear();
    g.fillStyle(theme.ground).fillRect(0, 0, w, h);
    const left = this.roadLeft();
    const roadW = this.track.lanes * this.track.laneWidth;
    // shoulder gradient strip flanking the tarmac
    g.fillStyle(theme.road, 0.35).fillRect(left - 26, 0, 26, h);
    g.fillStyle(theme.road, 0.35).fillRect(left + roadW, 0, 26, h);
    g.fillStyle(theme.road).fillRect(left, 0, roadW, h);
    // racing curbs: alternating red/white blocks scrolling with the road
    const curbH = 26;
    const curbOffset = myD % (curbH * 2);
    for (let y = -curbH * 2; y < h + curbH * 2; y += curbH) {
      const idx = Math.floor((y + curbOffset) / curbH);
      g.fillStyle(idx % 2 === 0 ? 0xd62828 : 0xf2e9e4);
      g.fillRect(left - 10, y + curbOffset, 10, curbH);
      g.fillRect(left + roadW, y + curbOffset, 10, curbH);
    }
    // scrolling lane dashes (world-anchored so they scroll with distance)
    const dashLen = 40, dashGap = 60, period = dashLen + dashGap;
    for (let lane = 1; lane < this.track.lanes; lane++) {
      const x = left + lane * this.track.laneWidth - 2;
      const offset = myD % period;
      for (let y = -period; y < h + period; y += period) {
        g.fillStyle(0xffffff, 0.35).fillRect(x, y + offset, 4, dashLen);
      }
    }
    // start and finish lines
    for (const lineD of [0, this.track.length]) {
      const y = this.dToY(lineD, myD);
      if (y > -20 && y < h + 20) {
        g.fillStyle(0xffffff).fillRect(left, y - 4, roadW, 8);
        g.fillStyle(0x000000);
        for (let i = 0; i < 8; i++) g.fillRect(left + i * (roadW / 8), y - 4, roadW / 16, 8);
      }
    }
  }

  private drawObstacles(state: StateMsg, myD: number): void {
    const seen = new Set<number>();
    // static obstacles from track data; moving traffic from the snapshot
    const movingD = new Map((state.traffic ?? []).map((t) => [t.id, t.d]));
    for (const o of this.track.obstacles) {
      const d = o.speed > 0 ? movingD.get(o.id) : o.d;
      if (d === undefined) continue;
      const y = this.dToY(d, myD);
      if (y < -60 || y > this.scale.height + 60) continue;
      seen.add(o.id);
      let sprite = this.obstacleSprites.get(o.id);
      if (!sprite) {
        sprite = this.add.sprite(0, 0, o.type === 'traffic' ? 'car-npc' : 'barrier').setDepth(5);
        if (o.type === 'traffic') sprite.setDisplaySize(42, 63);
        else sprite.setScale(1.4);
        this.obstacleSprites.set(o.id, sprite);
      }
      sprite.setPosition(this.laneToX(o.lane), y).setVisible(true);
    }
    for (const [id, sprite] of this.obstacleSprites) {
      if (!seen.has(id)) sprite.setVisible(false);
    }
  }

  private drawItems(state: StateMsg, myD: number): void {
    const taken = new Set(state.takenItems ?? []);
    for (const it of this.track.items) {
      const y = this.dToY(it.d, myD);
      let sprite = this.itemSprites.get(it.id);
      if (y < -40 || y > this.scale.height + 40 || taken.has(it.id)) {
        sprite?.setVisible(false);
        continue;
      }
      if (!sprite) {
        sprite = this.add.sprite(0, 0, 'item-box').setDepth(4).setScale(1.6);
        this.itemSprites.set(it.id, sprite);
        this.tweens.add({ targets: sprite, scale: 1.9, duration: 500, yoyo: true, repeat: -1 });
      }
      sprite.setPosition(this.laneToX(it.lane), y).setVisible(true);
    }
  }

  private drawCars(state: StateMsg, myD: number): void {
    const seen = new Set<number>();
    for (const c of state.cars) {
      const y = this.dToY(c.d, myD);
      if (y < -80 || y > this.scale.height + 80) {
        this.carSprites.get(c.slot)?.setVisible(false);
        this.nameLabels.get(c.slot)?.setVisible(false);
        continue;
      }
      seen.add(c.slot);
      let sprite = this.carSprites.get(c.slot);
      if (!sprite) {
        // each racer renders as their actual car model; fall back to the
        // slot-colored placeholder if the roster hasn't arrived yet
        const carId = this.carsBySlot.get(c.slot);
        const key = carId && this.textures.exists(`car-${carId}`)
          ? `car-${carId}` : `car-slot-${c.slot % SLOT_COLORS.length}`;
        // normalize to lane proportions regardless of source PNG dimensions
        sprite = this.add.sprite(0, 0, key).setDepth(10).setDisplaySize(42, 63);
        this.carSprites.set(c.slot, sprite);
        const label = this.add.text(0, 0, '', {
          fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(11);
        this.nameLabels.set(c.slot, label);
      }
      let lane = c.lane;
      if (c.slot === this.mySlot) {
        // My car renders from LOCAL prediction only: predictedLaneF slides
        // toward predictedLane with the same curve the server uses, so a tap
        // moves the car crisply into the lane (blending with the ~100ms-late
        // server lane caused the old "dragging" feel).
        //
        // Server reconciliation with an input-settle grace: the server lane
        // legitimately trails prediction right after taps (double-tap = 2
        // lanes ahead of a 100ms-old snapshot), so drift alone must NOT snap
        // — that was the "jumps back to the old lane" bug. Only snap on hard
        // conflicts (crash/stun rewinds the car) or when drift persists well
        // after the last tap (server genuinely disagrees, e.g. edge-clamped).
        const settled = performance.now() - this.lastTapAt > 600;
        if (this.predictedLane === null || c.stunned || c.crashed ||
            (settled && Math.abs(this.predictedLane - c.lane) > 0.6)) {
          this.predictedLane = Math.round(c.lane);
          this.predictedLaneF = c.lane;
        }
        const now = performance.now();
        const dt = this.lastRenderAt ? Math.min(0.1, (now - this.lastRenderAt) / 1000) : 0;
        this.lastRenderAt = now;
        const slide = dt / 0.16; // laneChangeTime, matching the server sim
        const diff = this.predictedLane - this.predictedLaneF;
        if (Math.abs(diff) <= slide) this.predictedLaneF = this.predictedLane;
        else this.predictedLaneF += Math.sign(diff) * slide;
        lane = this.predictedLaneF;
      }
      const x = this.laneToX(lane);
      sprite.setPosition(x, y).setVisible(true);
      sprite.setAlpha(c.stunned ? 0.4 : c.crashed ? 0.7 : 1);
      sprite.setTint(c.nitroActive ? 0xffffaa : 0xffffff);
      // nitro exhaust flame flickering behind the car
      this.drawFlame(c.slot, c.nitroActive, x, y + 38);
      const label = this.nameLabels.get(c.slot)!;
      label.setPosition(x, y - 42).setVisible(true);
      const name = c.slot === this.mySlot ? '' : this.namesBySlot.get(c.slot) ?? '';
      if (label.text !== name) label.setText(name);
    }
    for (const [slot, sprite] of this.carSprites) {
      if (!seen.has(slot)) {
        sprite.setVisible(false);
        this.nameLabels.get(slot)?.setVisible(false);
        this.flameSprites.get(slot)?.setVisible(false);
      }
    }
  }

  private drawBombs(state: StateMsg, myD: number): void {
    const seen = new Set<number>();
    for (const b of state.bombs ?? []) {
      seen.add(b.id);
      const y = this.dToY(b.d, myD);
      if (y < -40 || y > this.scale.height + 40) continue;
      let sprite = this.bombSprites.get(b.id);
      if (!sprite) {
        sprite = this.add.sprite(0, 0, 'bomb').setDepth(6).setScale(1.6);
        this.bombSprites.set(b.id, sprite);
      }
      sprite.setPosition(this.laneToX(b.lane), y)
        .setTint(b.armed ? 0xff6666 : 0xffffff).setVisible(true);
    }
    for (const [id, sprite] of this.bombSprites) {
      if (!seen.has(id)) { sprite.destroy(); this.bombSprites.delete(id); }
    }
  }

  /** Nitro feedback: streaking speed lines on the road while boosting. */
  private drawSpeedLines(myD: number): void {
    const g = this.roadG; // draw into the road layer, above tarmac
    const left = this.roadLeft();
    const roadW = this.track.lanes * this.track.laneWidth;
    const h = this.scale.height;
    // deterministic pseudo-random x positions, fast-scrolling with distance
    const lineLen = 90, period = 140;
    const offset = (myD * 2.2) % period;
    for (let i = 0; i < 10; i++) {
      const x = left + ((i * 97) % roadW);
      for (let y = -period; y < h + period; y += period) {
        g.fillStyle(0xffffff, 0.25).fillRect(x, y + offset + i * 13, 3, lineLen);
      }
    }
  }

  private drawFlame(slot: number, on: boolean, x: number, y: number): void {
    let flame = this.flameSprites.get(slot);
    if (!on) { flame?.setVisible(false); return; }
    if (!flame) {
      flame = this.add.sprite(0, 0, 'flame').setDepth(9).setScale(2);
      this.flameSprites.set(slot, flame);
    }
    flame.setPosition(x, y).setVisible(true)
      .setScale(2, 1.6 + Math.random() * 0.9)
      .setAlpha(0.7 + Math.random() * 0.3);
  }

  /** Right-edge vertical progress strip with a dot per car. */
  private drawProgress(state: StateMsg): void {
    const g = this.progressBar;
    const x = this.scale.width - 26, top = 60, height = this.scale.height - 140;
    g.clear();
    g.fillStyle(0x000000, 0.4).fillRect(x - 4, top - 6, 20, height + 12);
    g.fillStyle(0xffffff, 0.6).fillRect(x + 3, top, 2, height);
    for (const c of state.cars) {
      const frac = Math.min(1, c.d / this.track.length);
      const y = top + height - frac * height;
      g.fillStyle(c.slot === this.mySlot ? 0xffd60a : SLOT_COLORS[c.slot % SLOT_COLORS.length], 1);
      g.fillCircle(x + 4, y, c.slot === this.mySlot ? 6 : 4);
    }
  }
}

export interface ResultsParams {
  standings: Standing[]; mySlot: number; params: RaceParams;
}
