import { loadSavedYouTubeBeatmap } from "./BeatSyncEngine.js";

export const RHYTHM_MODES = {
  RHYTHM_MATCHED: "Rhythm Matched",
  BASIC_RHYTHM: "Basic Rhythm",
  FREE_PLAY: "Free Play",
  ANALYZING: "Listening..."
};

export function resolveTrackRhythm(videoId, storage = null) {
  const saved = videoId ? loadSavedYouTubeBeatmap(videoId, storage) : null;
  if (saved && saved.bpm && saved.confidence >= 80) {
    return {
      rhythmTier: "matched",
      bpm: saved.bpm,
      firstBeatSeconds: saved.firstBeatSeconds || 0,
      hasPhaseLock: true,
      hasTempoEstimate: true,
      confidence: saved.confidence
    };
  }
  if (saved && saved.bpm) {
    return {
      rhythmTier: "basic",
      bpm: saved.bpm,
      firstBeatSeconds: 0,
      hasPhaseLock: false,
      hasTempoEstimate: true,
      confidence: saved.confidence || 60
    };
  }
  return {
    rhythmTier: "free",
    bpm: 116,
    firstBeatSeconds: 0,
    hasPhaseLock: false,
    hasTempoEstimate: false,
    confidence: 0
  };
}

/**
 * Derives truthful, plain-language music status tied to actual player events
 * rather than claiming readiness immediately upon URL parsing.
 */
export function deriveSyncSummary({
  audioSource,
  isPlaylist = false,
  ytLoadState = "idle", // "idle" | "loading" | "cued" | "playing" | "error"
  bpm,
  hasPhaseLock = false,
  hasTempoEstimate = false,
  isAnalyzing = false
}) {
  if (isAnalyzing) {
    return {
      state: RHYTHM_MODES.ANALYZING,
      rhythmTier: "free",
      detail: "Listening to rhythm...",
      badgeTone: "warn"
    };
  }

  if (audioSource === "youtube") {
    if (ytLoadState === "error") {
      return {
        state: "Unavailable",
        rhythmTier: "free",
        detail: isPlaylist ? "Couldn't play this playlist" : "Couldn't play this video",
        badgeTone: "warn"
      };
    }
    if (ytLoadState === "loading") {
      return {
        state: isPlaylist ? "Continuous Dance" : "YouTube",
        rhythmTier: hasPhaseLock ? "matched" : "free",
        detail: "Loading music...",
        badgeTone: "warn"
      };
    }
    const ytStateLabel = isPlaylist
      ? "Continuous Dance"
      : hasPhaseLock
        ? RHYTHM_MODES.RHYTHM_MATCHED
        : hasTempoEstimate && bpm > 0
          ? RHYTHM_MODES.BASIC_RHYTHM
          : RHYTHM_MODES.FREE_PLAY;
    const ytTier = hasPhaseLock ? "matched" : hasTempoEstimate && bpm > 0 ? "basic" : "free";

    if (ytLoadState === "playing") {
      return {
        state: ytStateLabel,
        rhythmTier: ytTier,
        detail: "Now playing",
        badgeTone: "ok"
      };
    }
    if (ytLoadState === "cued") {
      return {
        state: ytStateLabel,
        rhythmTier: ytTier,
        detail: "Music ready",
        badgeTone: "ok"
      };
    }
    return {
      state: isPlaylist ? "Continuous Dance" : "YouTube",
      rhythmTier: "free",
      detail: isPlaylist ? "Playlist link recognized" : "Video link recognized",
      badgeTone: "warn"
    };
  }

  if (audioSource === "synth") {
    return {
      state: RHYTHM_MODES.RHYTHM_MATCHED,
      rhythmTier: "matched",
      detail: "Music ready • Built-in adventure beat",
      badgeTone: "ok"
    };
  }

  if (hasPhaseLock) {
    return {
      state: RHYTHM_MODES.RHYTHM_MATCHED,
      rhythmTier: "matched",
      detail: "Music ready • Rhythm matched to song",
      badgeTone: "ok"
    };
  }

  if (hasTempoEstimate && bpm > 0) {
    return {
      state: RHYTHM_MODES.BASIC_RHYTHM,
      rhythmTier: "basic",
      detail: "Music ready • Following basic rhythm",
      badgeTone: "ok"
    };
  }

  return {
    state: RHYTHM_MODES.FREE_PLAY,
    rhythmTier: "free",
    detail: "Music ready • Forgiving Free Play mode",
    badgeTone: "ok"
  };
}
