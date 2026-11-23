import { SAMPLE_TRACKS } from "../constants/sampleTracks";
import { analyzeLocalAudioBuffer } from "./BeatSyncEngine";

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.customBuffer = null;
    this.activeSource = null;
    this.schedulerTimer = null;
    this.nextNoteTime = 0;
    this.currentBeat = 0;
    this.isRunning = false;
  }

  async ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  async loadCustomAudio(file) {
    const arrayBuf = await file.arrayBuffer();
    const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.customBuffer = await tempCtx.decodeAudioData(arrayBuf);
    const analysis = analyzeLocalAudioBuffer(this.customBuffer);
    await tempCtx.close();
    return analysis;
  }

  clearCustomAudio() {
    this.customBuffer = null;
  }

  startLoop({ bpm, trackId = "volcano-dash", muteSynthDrums = false, latencyOffsetSec, onVisualBeat }) {
    this.stopLoop();
    const beatSec = 60 / bpm;
    const startOffset = this.ctx.currentTime + 0.25;
    const track = SAMPLE_TRACKS.find((t) => t.id === trackId) || SAMPLE_TRACKS[0];

    if (this.customBuffer && !muteSynthDrums) {
      this.activeSource = this.ctx.createBufferSource();
      this.activeSource.buffer = this.customBuffer;
      this.activeSource.loop = true;
      this.activeSource.connect(this.ctx.destination);
      this.activeSource.start(startOffset);
    }

    this.nextNoteTime = startOffset;
    this.currentBeat = 0;
    this.isRunning = true;

    const tick = () => {
      if (!this.isRunning) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
        const beatNum = this.currentBeat;
        const time = this.nextNoteTime;

        if (!this.customBuffer && !muteSynthDrums) {
          this.playKick(time);
          if (beatNum % 2 === 1) this.playSnare(time);
          this.playHiHat(time + beatSec * 0.5);

          const bassFreq = track.bassNotes[beatNum % track.bassNotes.length];
          if (bassFreq > 0) this.playBass(time, bassFreq, beatSec, track.rootType);

          const leadFreq = track.leadNotes[beatNum % track.leadNotes.length];
          if (leadFreq > 0) this.playLead(time, leadFreq, beatSec, track.leadType);
        }

        const delayMs = Math.max(0, (time + latencyOffsetSec - this.ctx.currentTime) * 1000);
        setTimeout(() => {
          if (this.isRunning) onVisualBeat(beatNum);
        }, delayMs);

        this.nextNoteTime += beatSec;
        this.currentBeat++;
      }
      this.schedulerTimer = setTimeout(tick, 25);
    };

    tick();
    return startOffset;
  }

  stopLoop() {
    this.isRunning = false;
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.activeSource) {
      try {
        this.activeSource.stop();
      } catch {
        // Ignore if already stopped
      }
      this.activeSource = null;
    }
  }

  playKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.14);
    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  playSnare(time) {
    const bufferSize = this.ctx.sampleRate * 0.12;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 950;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(time);
  }

  playHiHat(time) {
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(time);
  }

  playBass(time, freq, beatSec, waveType = "triangle") {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = waveType;
    osc.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, time);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + beatSec * 0.85);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + beatSec * 0.85);
  }

  playLead(time, freq, beatSec, waveType = "triangle") {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = waveType;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.11, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + beatSec * 0.75);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + beatSec * 0.75);
  }

  playFreezeBell() {
    if (!this.ctx) return;
    [1318.5, 1975.5].forEach((freq, i) => {
      const now = this.ctx.currentTime + i * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    });
  }

  playGateChord() {
    if (!this.ctx) return;
    [523.25, 659.25, 783.99].forEach((freq) => {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  playHitChime(isPerfect, pitchShift = 1.0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    const baseFreq = (isPerfect ? 659.25 : 493.88) * pitchShift;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.14);
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  playLavaRumble() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 0.85;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.04 * white) / 1.04;
      lastOut = data[i];
      data[i] *= 3.2;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(90, now);
    filter.frequency.linearRampToValueAtTime(240, now + 0.4);
    filter.frequency.linearRampToValueAtTime(80, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  playLaserSweep() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.38);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playHazardZap() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(75, now + 0.25);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playCountdownTick(isFinal) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(isFinal ? 880 : 587.33, now);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playVictoryFanfare() {
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const start = this.ctx.currentTime + idx * 0.11;
      const dur = idx === notes.length - 1 ? 0.55 : 0.16;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    });
  }
}
