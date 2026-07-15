// WebSocket client for the game server, with snapshot buffering for interpolation.

export interface CarState {
  slot: number; d: number; lane: number; pos: number; item: string;
  nitroActive: boolean; stunned: boolean; crashed: boolean; finished: boolean; isBot: boolean;
}
export interface TrafficState { id: number; d: number; lane: number }
export interface BombState { id: number; d: number; lane: number; armed: boolean }
export interface StateMsg {
  t: 'state'; tick: number; cars: CarState[];
  traffic?: TrafficState[]; bombs?: BombState[]; takenItems?: number[];
}
export interface PlayerInfo { slot: number; playerId: string; name: string; carId: string; connected: boolean; isBot?: boolean }
export interface Standing {
  slot: number; playerId: string; name: string; position: number; timeMs: number; finished: boolean; isBot?: boolean;
}

export interface JoinParams {
  playerSessionId: string; playerId: string; name: string; carId: string;
}

type Snapshot = { at: number; state: StateMsg };

export class GameConnection {
  private sock!: WebSocket;
  private snapshots: Snapshot[] = [];
  private seq = 0;
  private closedByUs = false;
  // network-quality tracking for adaptive smoothing
  private lastArrival = 0;
  private jitterEwma = 0;
  // WebRTC unreliable DataChannel (UDP): carries state + input when open,
  // eliminating TCP head-of-line blocking on lossy links. WS remains for
  // reliable messages and as full fallback.
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private lastStateTick = -1;

  onJoined?: (m: { yourSlot: number; trackId: string; players: PlayerInfo[]; raceState: string }) => void;
  onRoster?: (players: PlayerInfo[]) => void;
  onCountdown?: (secondsLeft: number) => void;
  onRaceStart?: () => void;
  onEvent?: (m: { kind: string; slot: number; data?: string }) => void;
  onResults?: (m: { trackId: string; standings: Standing[] }) => void;
  onError?: (reason: string) => void;
  onClose?: () => void;
  /** Fired when the socket drops mid-game and a rejoin starts. */
  onReconnecting?: () => void;

  /**
   * Connects with retries in BOTH phases: before `joined` (session may still
   * be activating) and after (flaky player networks / proxies killing live
   * websockets — the server reattaches rejoining players by playerId).
   */
  connect(url: string, join: JoinParams, attempt = 0): void {
    let joined = false;
    // per-connection counters: the server resets its consumed marks on rejoin
    this.leftTaps = 0;
    this.rightTaps = 0;
    this.lastStateTick = -1;
    this.teardownRtc(); // fresh negotiation per connection
    this.sock = new WebSocket(url);
    this.sock.onopen = () => this.sock.send(JSON.stringify({ t: 'join', ...join }));
    this.sock.onclose = () => {
      if (this.closedByUs) { this.onClose?.(); return; }
      if (!joined && attempt < 8) {
        setTimeout(() => this.connect(url, join, attempt + 1), 1500);
        return;
      }
      if (joined) {
        // mid-game drop: rejoin the same session with a fresh retry budget
        this.onReconnecting?.();
        setTimeout(() => this.connect(url, join, 0), 800);
        return;
      }
      this.onClose?.();
    };
    const prevOnJoined = (m: Parameters<NonNullable<typeof this.onJoined>>[0]) => {
      joined = true;
      void this.negotiateRtc();
      this.onJoined?.(m);
    };
    this.sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string);
      switch (m.t) {
        case 'joined': prevOnJoined(m); break;
        case 'roster': this.onRoster?.(m.players); break;
        case 'countdown': this.onCountdown?.(m.secondsLeft); break;
        case 'race_start': this.onRaceStart?.(); break;
        case 'state':
          this.ingestState(m);
          break;
        case 'rtc_answer':
          if (m.sdp && this.pc) {
            void this.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp })
              .catch(() => { this.teardownRtc(); });
          } else {
            this.teardownRtc(); // server declined; stay on WS
          }
          break;
        case 'event': this.onEvent?.(m); break;
        case 'results': this.onResults?.(m); break;
        case 'error': this.onError?.(m.reason); break;
        case 'server_shutdown': this.onClose?.(); break;
      }
    };
  }

  // Cumulative tap counters (see server InputMsg): tap() increments, every
  // frame carries the totals so no tap can be lost to timing or a dropped frame.
  private leftTaps = 0;
  private rightTaps = 0;

  tap(dir: -1 | 1): void {
    if (dir < 0) this.leftTaps++;
    else this.rightTaps++;
    this.sendInput(false);
  }

  sendInput(useItem: boolean): void {
    const frame = JSON.stringify({
      t: 'input', seq: this.seq++, lt: this.leftTaps, rt: this.rightTaps, useItem,
    });
    // UDP path when open (cumulative counters make dropped frames harmless);
    // WS otherwise
    if (this.dc?.readyState === 'open') {
      try { this.dc.send(frame); return; } catch { /* fall through to WS */ }
    }
    if (this.sock?.readyState === WebSocket.OPEN) {
      this.sock.send(frame);
    }
  }

  /** Snapshot intake shared by WS and DataChannel; drops out-of-order ticks. */
  private ingestState(m: StateMsg): void {
    if (m.tick <= this.lastStateTick) return; // stale (UDP reorder)
    this.lastStateTick = m.tick;
    const now = performance.now();
    // track arrival jitter to adapt the interpolation delay: with the nominal
    // 50ms cadence, |gap - 50| accumulates an EWMA of network burstiness
    if (this.lastArrival > 0) {
      const dev = Math.abs(now - this.lastArrival - 50);
      this.jitterEwma = this.jitterEwma * 0.9 + dev * 0.1;
    }
    this.lastArrival = now;
    this.snapshots.push({ at: now, state: m });
    if (this.snapshots.length > 40) this.snapshots.shift();
  }

  /** Offers a WebRTC unreliable DataChannel to the server over the WS. */
  private async negotiateRtc(): Promise<void> {
    if (this.pc || typeof RTCPeerConnection === 'undefined') return;
    try {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
      });
      this.dc = this.pc.createDataChannel('game', {
        ordered: false,
        maxRetransmits: 0, // pure unreliable: lost frame = skip, no HOL blocking
      });
      this.dc.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data as string);
          if (m.t === 'state') this.ingestState(m);
        } catch { /* ignore malformed */ }
      };
      this.dc.onclose = () => { /* server falls back to WS automatically */ };
      this.dc.onopen = () => console.info('[net] UDP datachannel OPEN — low-latency transport active');
      this.pc.oniceconnectionstatechange = () => {
        const s = this.pc?.iceConnectionState;
        console.info(`[net] ICE ${s}`);
        if (s === 'failed') console.info('[net] UDP blocked on this network — running on WebSocket fallback');
      };
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      // wait for ICE gathering so the offer carries candidates (no trickle)
      await new Promise<void>((resolve) => {
        if (this.pc!.iceGatheringState === 'complete') { resolve(); return; }
        const check = () => {
          if (this.pc!.iceGatheringState === 'complete') {
            this.pc!.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        };
        this.pc!.addEventListener('icegatheringstatechange', check);
        setTimeout(resolve, 3500); // allow STUN round-trips on slow links
      });
      if (this.sock?.readyState === WebSocket.OPEN && this.pc.localDescription) {
        this.sock.send(JSON.stringify({ t: 'rtc_offer', sdp: this.pc.localDescription.sdp }));
      }
      // UDP-hostile network: if ICE can't connect within 8s, free the peer
      // connection — the game is already running fine over WS
      setTimeout(() => {
        if (this.dc && this.dc.readyState !== 'open') this.teardownRtc();
      }, 12000);
    } catch {
      this.teardownRtc();
    }
  }

  private teardownRtc(): void {
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
  }

  close(): void {
    this.closedByUs = true;
    this.teardownRtc();
    this.sock?.close();
  }

  /**
   * Smoothed view of the world.
   *
   * - Interpolation delay ADAPTS to measured jitter (100ms on clean links,
   *   up to 350ms on bursty ones) so the buffer rarely runs dry.
   * - When it does run dry (TCP resend stall), cars EXTRAPOLATE along their
   *   velocity (dead reckoning) for up to 500ms instead of freezing — in a
   *   lane racer forward motion is almost perfectly predictable, so this
   *   turns visible stutter into invisible guesswork.
   */
  interpolated(): StateMsg | null {
    const n = this.snapshots.length;
    if (n === 0) return null;
    if (n === 1) return this.snapshots[0].state;

    const delay = Math.min(500, Math.max(100, 60 + this.jitterEwma * 4));
    const renderAt = performance.now() - delay;
    const newest = this.snapshots[n - 1];

    if (renderAt > newest.at) {
      // buffer dry: extrapolate from the last two snapshots' velocities
      const prev = this.snapshots[n - 2];
      const ahead = Math.min(1500, renderAt - newest.at);
      return extrapolate(prev, newest, ahead);
    }

    let a = this.snapshots[0], b = this.snapshots[1];
    for (let i = n - 1; i > 0; i--) {
      if (this.snapshots[i - 1].at <= renderAt) { a = this.snapshots[i - 1]; b = this.snapshots[i]; break; }
    }
    const span = b.at - a.at;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderAt - a.at) / span)) : 1;
    return blend(a.state, b.state, t);
  }
}

/** Project car/traffic positions `aheadMs` past snapshot b using b-a velocity. */
function extrapolate(a: Snapshot, b: Snapshot, aheadMs: number): StateMsg {
  const span = Math.max(1, b.at - a.at);
  const k = aheadMs / span;
  const cars = b.state.cars.map((cb) => {
    const ca = a.state.cars.find((c) => c.slot === cb.slot);
    if (!ca || cb.finished) return cb;
    // forward motion extrapolates well; lane stays at the last known value
    // (guessing lane changes would cause visible corrections)
    return { ...cb, d: cb.d + (cb.d - ca.d) * k };
  });
  const traffic = b.state.traffic?.map((tb) => {
    const ta = a.state.traffic?.find((x) => x.id === tb.id);
    if (!ta) return tb;
    return { ...tb, d: tb.d + (tb.d - ta.d) * k };
  });
  return { ...b.state, cars, traffic };
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function blend(a: StateMsg, b: StateMsg, t: number): StateMsg {
  const cars = b.cars.map((cb) => {
    const ca = a.cars.find((c) => c.slot === cb.slot);
    if (!ca) return cb;
    return { ...cb, d: lerp(ca.d, cb.d, t), lane: lerp(ca.lane, cb.lane, t) };
  });
  const traffic = b.traffic?.map((tb) => {
    const ta = a.traffic?.find((x) => x.id === tb.id);
    if (!ta) return tb;
    return { ...tb, d: lerp(ta.d, tb.d, t) };
  });
  return { ...b, cars, traffic };
}
