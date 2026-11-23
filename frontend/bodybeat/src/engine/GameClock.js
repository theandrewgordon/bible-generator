/**
 * Single authoritative gameplay clock separating continuous Session Time
 * from per-song Track Time so YouTube playlist track transitions never reset session progress.
 */
export class GameClock {
  constructor({ getAudioTime, getYouTubeState } = {}) {
    this.getAudioTime = getAudioTime || (() => performance.now() / 1000);
    // Expected to return { ready: boolean, playing: boolean, time: number }
    this.getYouTubeState = getYouTubeState || (() => ({ ready: false, playing: false, time: 0 }));

    this.mode = "audio"; // "audio" | "youtube"
    this.isPaused = false;
    this.pausedAt = 0;
    this.lastRawTime = 0;
    this.sessionElapsed = 0;
    this.wasInterrupted = false;
  }

  reset(mode = "audio") {
    this.mode = mode;
    this.isPaused = false;
    this.wasInterrupted = false;
    this.sessionElapsed = 0;
    const initial = this.readSourceTime();
    this.lastRawTime = initial !== null ? initial : 0;
    this.pausedAt = this.lastRawTime;
  }

  /**
   * Resets track-level clock anchors when a playlist advances to a new song,
   * while preserving cumulative sessionElapsed time.
   */
  resetTrack(newTrackTime = 0) {
    this.lastRawTime = Math.max(0, newTrackTime);
    this.pausedAt = this.lastRawTime;
    this.wasInterrupted = true;
  }

  readSourceTime() {
    if (this.mode === "youtube") {
      const yt = this.getYouTubeState();
      if (
        !yt ||
        !yt.ready ||
        !yt.playing ||
        typeof yt.time !== "number" ||
        Number.isNaN(yt.time) ||
        yt.time < 0
      ) {
        return null;
      }
      return yt.time;
    }
    return this.getAudioTime();
  }

  /**
   * Returns { ready, playing, trackNow, sessionNow, dt, seekDetected, seekDelta }
   */
  tick() {
    if (this.isPaused) {
      this.wasInterrupted = true;
      return {
        ready: true,
        playing: false,
        now: this.pausedAt,
        trackNow: this.pausedAt,
        sessionNow: this.sessionElapsed,
        dt: 0,
        seekDetected: false,
        seekDelta: 0
      };
    }

    const raw = this.readSourceTime();
    if (raw === null) {
      this.wasInterrupted = true;
      return {
        ready: false,
        playing: false,
        now: this.lastRawTime,
        trackNow: this.lastRawTime,
        sessionNow: this.sessionElapsed,
        dt: 0,
        seekDetected: false,
        seekDelta: 0
      };
    }

    const delta = raw - this.lastRawTime;
    let seekDetected = false;

    if (
      this.mode === "youtube" &&
      !this.wasInterrupted &&
      this.lastRawTime > 0 &&
      Math.abs(delta) > 1.5
    ) {
      seekDetected = true;
    }

    // Advance sessionElapsed only by normal forward playback deltas (clamp out seek jumps)
    const safeDt = !seekDetected && delta > 0 && delta < 1.5 ? delta : 0;
    this.sessionElapsed += safeDt;

    this.wasInterrupted = false;
    this.lastRawTime = raw;

    return {
      ready: true,
      playing: true,
      now: raw,
      trackNow: raw,
      sessionNow: this.sessionElapsed,
      dt: safeDt,
      seekDetected,
      seekDelta: delta
    };
  }

  pause() {
    if (this.isPaused) return this.pausedAt;
    const raw = this.readSourceTime();
    this.pausedAt = raw !== null ? raw : this.lastRawTime;
    this.isPaused = true;
    this.wasInterrupted = true;
    return this.pausedAt;
  }

  resume() {
    if (!this.isPaused) return 0;
    const raw = this.readSourceTime();
    const resumedAt = raw !== null ? raw : this.pausedAt;
    const pausedDuration = Math.max(0, resumedAt - this.pausedAt);
    this.lastRawTime = resumedAt;
    this.isPaused = false;
    this.wasInterrupted = true;
    return pausedDuration;
  }
}
