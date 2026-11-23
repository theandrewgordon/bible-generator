/**
 * Deterministic state controller for round lifecycle, pause reasons, cancellable countdowns,
 * and immediate audio source fallback without arbitrary setTimeout guesses.
 */
export class RoundLifecycleController {
  constructor() {
    this.phase = "lobby"; // "lobby" | "preparing_media" | "countdown" | "playing" | "podium"
    this.pauseReason = null; // null | "user" | "tracking" | "media"
    this.countdownToken = 0;
    this.audioSource = "synth";
  }

  resetToLobby(audioSource = "synth") {
    this.countdownToken++;
    this.phase = "lobby";
    this.pauseReason = null;
    this.audioSource = audioSource;
  }

  beginPreparingMedia(audioSource) {
    this.countdownToken++;
    this.audioSource = audioSource;
    this.pauseReason = null;
    this.phase = audioSource === "youtube" ? "preparing_media" : "countdown";
    return { phase: this.phase, token: this.countdownToken };
  }

  confirmMediaPlaying() {
    if (this.phase !== "preparing_media") return null;
    this.countdownToken++;
    this.phase = "countdown";
    return { phase: this.phase, token: this.countdownToken };
  }

  beginCountdown() {
    this.countdownToken++;
    this.phase = "countdown";
    return this.countdownToken;
  }

  cancelCountdown(nextPhase = "playing") {
    this.countdownToken++;
    this.phase = nextPhase;
    return this.countdownToken;
  }

  isTokenValid(token) {
    return this.countdownToken === token;
  }

  startPlaying() {
    this.countdownToken++;
    this.phase = "playing";
    this.pauseReason = null;
  }

  /**
   * Requests pause with an explicit reason ("user" | "tracking" | "media").
   * User pause always takes precedence over automatic tracking/media pauses.
   */
  requestPause(reason = "user") {
    if (this.phase !== "playing" && this.phase !== "countdown") return false;
    if (this.pauseReason === "user" && reason !== "user") {
      return false; // Never downgrade an intentional user pause
    }
    this.countdownToken++;
    this.phase = "playing";
    this.pauseReason = reason;
    return true;
  }

  /**
   * Handles external media PLAYING events (e.g., YouTube buffering recovery).
   * Strictly ignores the event if the user deliberately paused the game or tracking is absent.
   */
  handleExternalMediaPlaying() {
    if (this.phase === "preparing_media") {
      return { action: "START_COUNTDOWN", token: this.confirmMediaPlaying().token };
    }
    if (this.pauseReason === "user" || this.pauseReason === "tracking") {
      return { action: "IGNORE" };
    }
    if (this.pauseReason === "media") {
      this.pauseReason = null;
      return { action: "RESUME_MEDIA" };
    }
    return { action: "IGNORE" };
  }

  /**
   * Handles external media PAUSED/BUFFERING events.
   */
  handleExternalMediaPaused() {
    if (this.phase !== "playing") return { action: "IGNORE" };
    if (this.pauseReason === "user") return { action: "IGNORE" };
    this.pauseReason = "media";
    return { action: "PAUSE_MEDIA" };
  }

  /**
   * User explicitly clicks Resume.
   */
  requestUserResume() {
    if (this.phase !== "playing" || !this.pauseReason) return false;
    this.pauseReason = null;
    return true;
  }

  /**
   * Explicit zero-delay recovery to built-in synth music.
   */
  recoverToBuiltinMusic() {
    const wasInterrupted =
      this.phase === "preparing_media" ||
      this.phase === "countdown" ||
      this.phase === "playing";
    this.countdownToken++;
    this.audioSource = "synth";
    this.pauseReason = null;
    this.phase = wasInterrupted ? "playing" : "lobby";
    return { shouldRestartRound: wasInterrupted, phase: this.phase };
  }
}
