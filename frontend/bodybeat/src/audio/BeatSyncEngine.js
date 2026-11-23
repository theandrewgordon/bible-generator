const YT_BEATMAPS_KEY = "volcano_run_yt_beatmaps_v1";

export function loadSavedYouTubeBeatmap(videoId, storage = globalThis.localStorage) {
  if (!videoId) return null;
  try {
    const map = JSON.parse(storage?.getItem(YT_BEATMAPS_KEY) || "{}");
    return map[videoId] || null;
  } catch {
    return null;
  }
}

export function saveYouTubeBeatmap(videoId, data, storage = globalThis.localStorage) {
  if (!videoId) return;
  try {
    const map = JSON.parse(storage?.getItem(YT_BEATMAPS_KEY) || "{}");
    map[videoId] = {
      bpm: data.bpm,
      firstBeatSeconds: Number((data.firstBeatSeconds || 0).toFixed(3)),
      confidence: Math.round(data.confidence || 90),
      updatedAt: Date.now()
    };
    storage?.setItem(YT_BEATMAPS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Offline Web Audio analyzer for locally uploaded MP3/WAV files:
 * Extracts BPM, firstBeatSeconds phase, confidence %, and per-8-beat intensity curve.
 */
export function analyzeLocalAudioBuffer(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const channel = audioBuffer.getChannelData(0);
  const hopSize = Math.floor(sampleRate * 0.02); // 50 Hz envelope
  const numFrames = Math.floor(channel.length / hopSize);

  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    const offset = f * hopSize;
    for (let i = 0; i < hopSize; i++) {
      const s = channel[offset + i];
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / hopSize);
  }

  // Positive onset flux
  const onset = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    onset[f] = Math.max(0, energy[f] - energy[f - 1]);
  }

  // Autocorrelation across 72 - 172 BPM
  let bestBpm = 120;
  let bestCorr = 0;
  let secondCorr = 0;

  for (let bpm = 72; bpm <= 172; bpm++) {
    const lag = Math.round((60 / bpm) / 0.02);
    const lag2 = lag * 2;
    let corr = 0;
    let count = 0;
    for (let i = 0; i < numFrames - lag2; i++) {
      corr += onset[i] * onset[i + lag] + 0.5 * onset[i] * onset[i + lag2];
      count++;
    }
    if (count > 0) corr /= count;
    const weight = 1 - Math.abs(bpm - 120) * 0.0012;
    const score = corr * weight;
    if (score > bestCorr) {
      secondCorr = bestCorr;
      bestCorr = score;
      bestBpm = bpm;
    } else if (score > secondCorr) {
      secondCorr = score;
    }
  }

  // Phase search: find firstBeatSeconds offset (0 .. beatSec) with strongest onset sum
  const beatSec = 60 / bestBpm;
  const beatFrames = beatSec / 0.02;
  let bestPhaseFrame = 0;
  let bestPhaseScore = -1;

  for (let p = 0; p < Math.ceil(beatFrames); p++) {
    let sum = 0;
    for (let idx = p; idx < numFrames; idx += beatFrames) {
      sum += onset[Math.round(idx)];
    }
    if (sum > bestPhaseScore) {
      bestPhaseScore = sum;
      bestPhaseFrame = p;
    }
  }

  const firstBeatSeconds = Number((bestPhaseFrame * 0.02).toFixed(3));
  const peakRatio = secondCorr > 0 ? bestCorr / secondCorr : 1.05;
  const confidence = Math.min(92, Math.max(45, Math.round(48 + (peakRatio - 1) * 120)));

  // Compute musical intensity per 8-beat phrase (0.0 quiet intro -> 1.0 loud chorus)
  const maxEnergy = energy.reduce((m, v) => (v > m ? v : m), 0.001);
  const phraseSec = beatSec * 8;
  const numPhrases = Math.max(1, Math.ceil(audioBuffer.duration / phraseSec));
  const phraseIntensity = [];

  for (let p = 0; p < numPhrases; p++) {
    const startF = Math.floor((p * phraseSec) / 0.02);
    const endF = Math.min(numFrames, Math.floor(((p + 1) * phraseSec) / 0.02));
    let sum = 0;
    for (let f = startF; f < endF; f++) sum += energy[f];
    const avg = endF > startF ? sum / (endF - startF) : 0.5;
    phraseIntensity.push(Math.min(1, avg / (maxEnergy * 0.72)));
  }

  return {
    bpm: bestBpm,
    firstBeatSeconds,
    confidence,
    phraseIntensity
  };
}
