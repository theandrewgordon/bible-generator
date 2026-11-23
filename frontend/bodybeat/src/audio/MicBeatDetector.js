export class MicBeatDetector {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.freqData = null;
    this.prevSpec = null;
    this.rafId = null;
    this.isListening = false;

    this.onsetEnvelope = []; // Rolling ~5 seconds of onset energy at ~60fps
    this.fluxHistory = [];
    this.lastBeatTime = 0;
    this.lastBpmCalcTime = 0;
    this.learnedBpm = null;
  }

  /**
   * mode: "mic" (for external room speakers) | "tab" (captures browser tab/system audio directly without echo cancellation)
   */
  async start({ mode = "mic", onBeat, onBpmLearned, onLevel }) {
    if (this.isListening) this.stop();

    if (mode === "tab") {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Tab audio capture is not supported in this browser. Use Chrome on desktop or Tap Tempo on iPad.");
      }
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required by spec to prompt tab/screen share
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      // Immediately stop the video track; we only need the audio track
      displayStream.getVideoTracks().forEach((t) => t.stop());
      if (displayStream.getAudioTracks().length === 0) {
        throw new Error("No audio track shared. Make sure 'Share tab audio' is checked in the popup!");
      }
      this.stream = displayStream;
    } else {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: false
      });
    }

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.1;
    source.connect(this.analyser);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.prevSpec = new Float32Array(this.analyser.frequencyBinCount);
    this.onsetEnvelope = [];
    this.fluxHistory = [];
    this.lastBeatTime = 0;
    this.lastBpmCalcTime = performance.now();
    this.isListening = true;

    const sampleRate = this.ctx.sampleRate;
    const binHz = sampleRate / this.analyser.fftSize;
    // Focus on 45Hz - 300Hz (kick drum + snare body)
    const minBin = Math.max(1, Math.floor(45 / binHz));
    const maxBin = Math.min(this.freqData.length - 1, Math.ceil(300 / binHz));

    const loop = () => {
      if (!this.isListening) return;

      this.analyser.getByteFrequencyData(this.freqData);

      let flux = 0;
      let rawSum = 0;
      for (let i = minBin; i <= maxBin; i++) {
        const val = this.freqData[i];
        rawSum += val;
        const diff = val - this.prevSpec[i];
        if (diff > 0) flux += diff;
        this.prevSpec[i] = val;
      }

      const avgBinVal = rawSum / (maxBin - minBin + 1);
      if (onLevel) {
        onLevel(Math.min(100, (avgBinVal / 95) * 100));
      }

      const now = performance.now();

      // Store timestamped onset energy for autocorrelation BPM solver
      this.onsetEnvelope.push({ t: now, v: flux });
      // Keep last 5.5 seconds
      while (this.onsetEnvelope.length > 0 && now - this.onsetEnvelope[0].t > 5500) {
        this.onsetEnvelope.shift();
      }

      // Instantaneous beat trigger for visual flash & Live Mic mode
      this.fluxHistory.push(flux);
      if (this.fluxHistory.length > 45) this.fluxHistory.shift();
      const meanFlux =
        this.fluxHistory.reduce((acc, v) => acc + v, 0) / this.fluxHistory.length;

      if (
        this.fluxHistory.length >= 10 &&
        flux > 12 &&
        flux > meanFlux * 1.4 &&
        now - this.lastBeatTime > 290
      ) {
        this.lastBeatTime = now;
        if (onBeat) onBeat(now);
      }

      // Run autocorrelation BPM solver every 1.2 seconds once we have 3+ seconds of audio
      if (now - this.lastBpmCalcTime > 1200 && this.onsetEnvelope.length > 120) {
        this.lastBpmCalcTime = now;
        const result = this.solveBpmAutocorrelation();
        if (result && onBpmLearned) {
          this.learnedBpm = result.bpm;
          onBpmLearned(result);
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * Resamples the onset envelope to a uniform 50Hz grid and finds the strongest rhythmic lag (70-175 BPM)
   */
  solveBpmAutocorrelation() {
    const env = this.onsetEnvelope;
    if (env.length < 100) return null;

    const startT = env[0].t;
    const endT = env[env.length - 1].t;
    const durationMs = endT - startT;
    if (durationMs < 3000) return null;

    const stepMs = 20; // 50 Hz uniform sampling
    const numSamples = Math.floor(durationMs / stepMs);
    const signal = new Float32Array(numSamples);

    let envIdx = 0;
    let mean = 0;
    for (let i = 0; i < numSamples; i++) {
      const targetT = startT + i * stepMs;
      while (envIdx < env.length - 1 && env[envIdx + 1].t <= targetT) {
        envIdx++;
      }
      signal[i] = env[envIdx].v;
      mean += signal[i];
    }
    mean /= numSamples;

    // Zero-mean the signal
    for (let i = 0; i < numSamples; i++) {
      signal[i] = Math.max(0, signal[i] - mean);
    }

    // Test candidate BPMs from 72 to 172 BPM
    let bestBpm = null;
    let bestScore = -1;
    let secondScore = 0;

    for (let bpm = 72; bpm <= 172; bpm++) {
      const periodSamples = (60000 / bpm) / stepMs;
      const lag1 = Math.round(periodSamples);
      const lag2 = Math.round(periodSamples * 2);

      let corr = 0;
      let count = 0;
      for (let i = 0; i < numSamples - lag2; i++) {
        corr += signal[i] * signal[i + lag1] + 0.5 * signal[i] * signal[i + lag2];
        count++;
      }
      if (count > 0) corr /= count;

      const weight = 1 - Math.abs(bpm - 120) * 0.0015;
      const score = corr * weight;

      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestBpm = bpm;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }

    if (bestScore <= 5 || !bestBpm) return null;
    const sharpness = secondScore > 0 ? bestScore / secondScore : 1.25;
    const confidence = Math.min(98, Math.max(45, Math.round(52 + (sharpness - 1) * 140)));
    return { bpm: bestBpm, confidence, lastBeatPerfMs: this.lastBeatTime };
  }

  stop() {
    this.isListening = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
