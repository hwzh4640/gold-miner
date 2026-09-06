/** Tiny Web Audio synthesizer. No assets; everything is oscillators and noise. */
const MUTE_KEY = 'goldminer.muted';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private reelOsc: OscillatorNode | null = null;
  private reelGain: GainNode | null = null;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* ignore */
    }
  }

  /** Must be called from a user gesture on iOS/Chrome before sound can play. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.6, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.5): void {
    if (!this.ctx || !this.master) return;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  fire(): void {
    this.tone(320, 0.12, 'square', 0.25, 140);
  }
  grab(): void {
    this.tone(180, 0.08, 'square', 0.3);
    this.noise(0.08, 0.2);
  }
  cash(big: boolean): void {
    this.tone(880, 0.1, 'triangle', 0.5);
    setTimeout(() => this.tone(1320, 0.14, 'triangle', 0.5), 70);
    if (big) setTimeout(() => this.tone(1760, 0.2, 'triangle', 0.5), 150);
  }
  rock(): void {
    this.tone(120, 0.15, 'sawtooth', 0.3, 60);
  }
  bag(good: boolean): void {
    if (good) {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.15, 'sine', 0.5), i * 80));
    } else {
      this.tone(300, 0.3, 'sawtooth', 0.3, 120);
    }
  }
  dynamite(): void {
    this.noise(0.5, 0.9);
    this.tone(90, 0.4, 'sine', 0.8, 30);
  }
  tick(): void {
    this.tone(1200, 0.04, 'square', 0.15);
  }
  levelClear(): void {
    [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.5), i * 110));
  }
  gameOver(): void {
    [392, 349, 311, 261].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'sawtooth', 0.35), i * 220));
  }
  buy(): void {
    this.tone(660, 0.08, 'square', 0.3);
    setTimeout(() => this.tone(990, 0.12, 'square', 0.3), 60);
  }
  /** Continuous reel creak while retracting. */
  reel(on: boolean, speed: number): void {
    if (!this.ctx || !this.master) return;
    if (on && !this.reelOsc) {
      this.reelOsc = this.ctx.createOscillator();
      this.reelGain = this.ctx.createGain();
      this.reelOsc.type = 'sawtooth';
      this.reelGain.gain.value = 0.05;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 400;
      this.reelOsc.connect(f).connect(this.reelGain).connect(this.master);
      this.reelOsc.start();
    }
    if (this.reelOsc) {
      this.reelOsc.frequency.value = 40 + speed * 0.08;
      if (!on) {
        this.reelOsc.stop();
        this.reelOsc.disconnect();
        this.reelOsc = null;
        this.reelGain = null;
      }
    }
  }
}
