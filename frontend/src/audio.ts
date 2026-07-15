// Retro chiptune audio built entirely with the Web Audio API — square/triangle
// oscillators like an 8-bit sound chip, no audio files needed.

class RetroAudio {
  private ctx?: AudioContext;
  private musicTimer?: number;
  private musicGain?: GainNode;
  private step = 0;
  muted = false;

  private ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.musicGain) this.musicGain.gain.value = this.muted ? 0 : 0.14;
    return this.muted;
  }

  /** Engine start: low rumble sweeping up, like an ignition rev. */
  engineStart(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.35); // crank
    osc.frequency.exponentialRampToValueAtTime(220, t + 1.0); // catch + rev
    osc.frequency.exponentialRampToValueAtTime(120, t + 1.5); // settle to idle
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 1.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 2);
  }

  crash(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    const t = ctx.currentTime;
    // white-noise burst
    const len = ctx.sampleRate * 0.25;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    src.connect(gain).connect(ctx.destination);
    src.start(t);
  }

  pickup(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.setValueAtTime(880, t + 0.08);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /**
   * Looping chiptune BGM: a peppy 8-bar square-wave lead over a triangle
   * bass line, sequenced at 140 BPM — the classic NES racing feel.
   */
  startMusic(): void {
    if (this.musicTimer) return;
    const ctx = this.ensure();
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.muted ? 0 : 0.14;
    this.musicGain.connect(ctx.destination);

    // note numbers are MIDI; 0 = rest
    const lead = [
      76, 76, 0, 76, 0, 72, 76, 0, 79, 0, 0, 0, 67, 0, 0, 0,   // bar 1-2 (bright hook)
      72, 0, 0, 67, 0, 0, 64, 0, 0, 69, 0, 71, 0, 70, 69, 0,   // bar 3-4
      67, 76, 79, 81, 0, 77, 79, 0, 76, 0, 72, 74, 71, 0, 0, 0, // bar 5-6
      72, 72, 0, 72, 0, 72, 74, 0, 76, 72, 0, 69, 67, 0, 0, 0,  // bar 7-8
    ];
    const bass = [
      48, 0, 48, 0, 43, 0, 43, 0, 45, 0, 45, 0, 41, 0, 43, 0,
      48, 0, 48, 0, 43, 0, 43, 0, 45, 0, 45, 0, 41, 0, 43, 0,
      48, 0, 48, 0, 43, 0, 43, 0, 45, 0, 45, 0, 41, 0, 43, 0,
      45, 0, 45, 0, 47, 0, 47, 0, 48, 0, 48, 0, 43, 0, 43, 0,
    ];
    const stepDur = 60 / 140 / 2; // 16th notes at 140 BPM
    const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

    this.step = 0;
    const playStep = () => {
      const t = ctx.currentTime;
      const i = this.step % lead.length;
      if (lead[i]) this.blip(ctx, 'square', freq(lead[i]), t, stepDur * 0.9, 0.5);
      if (bass[i]) this.blip(ctx, 'triangle', freq(bass[i]), t, stepDur * 0.95, 0.8);
      this.step++;
    };
    playStep();
    this.musicTimer = window.setInterval(playStep, stepDur * 1000);
  }

  stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
    this.musicGain?.disconnect();
    this.musicGain = undefined;
  }

  private blip(ctx: AudioContext, type: OscillatorType, f: number, t: number, dur: number, vol: number): void {
    if (!this.musicGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
    osc.connect(gain).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur);
  }
}

export const audio = new RetroAudio();
