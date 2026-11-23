import test from "node:test";
import assert from "node:assert/strict";
import { RoundLifecycleController } from "../src/engine/RoundLifecycleController.js";

test("User pause is never overridden by YouTube PLAYING events", () => {
  const lc = new RoundLifecycleController();
  lc.startPlaying();

  assert.equal(lc.requestPause("user"), true);
  assert.equal(lc.pauseReason, "user");

  // External YouTube PLAYING callback arrives -> strictly ignored
  const decision = lc.handleExternalMediaPlaying();
  assert.equal(decision.action, "IGNORE");
  assert.equal(lc.pauseReason, "user");
});

test("Tracking loss cancels an active return countdown if player steps out again", () => {
  const lc = new RoundLifecycleController();
  lc.startPlaying();

  // Player disappears -> tracking pause
  assert.equal(lc.requestPause("tracking"), true);
  assert.equal(lc.pauseReason, "tracking");

  // Player returns -> starts cancellable return countdown
  const token = lc.beginCountdown();
  assert.equal(lc.isTokenValid(token), true);

  // Player steps out again before countdown finishes -> token invalidated!
  assert.equal(lc.requestPause("tracking"), true);
  assert.equal(lc.isTokenValid(token), false);
});

test("YouTube startup waits in preparing_media and recovers deterministically to Built-In Music", () => {
  const lc = new RoundLifecycleController();

  const prep = lc.beginPreparingMedia("youtube");
  assert.equal(prep.phase, "preparing_media");

  // User clicks Play with Built-In Music -> zero-delay deterministic transition to playing
  const recovery = lc.recoverToBuiltinMusic();
  assert.equal(recovery.shouldRestartRound, true);
  assert.equal(recovery.phase, "playing");
  assert.equal(lc.audioSource, "synth");
});

test("Repeated Start -> Pause -> Resume -> Quit cycles remain consistent", () => {
  const lc = new RoundLifecycleController();

  for (let cycle = 0; cycle < 3; cycle++) {
    lc.startPlaying();
    assert.equal(lc.phase, "playing");
    assert.equal(lc.requestPause("user"), true);
    assert.equal(lc.requestUserResume(), true);
    assert.equal(lc.pauseReason, null);
    lc.resetToLobby("synth");
    assert.equal(lc.phase, "lobby");
  }
});

test("Integrated scenario: Quitting during countdown cancels countdown cleanly", () => {
  const lc = new RoundLifecycleController();
  const token = lc.beginCountdown();
  assert.equal(lc.phase, "countdown");
  assert.equal(lc.isTokenValid(token), true);

  lc.resetToLobby("synth");
  assert.equal(lc.phase, "lobby");
  assert.equal(lc.isTokenValid(token), false);
});

test("YouTube buffering and cued states freeze media playback without overriding user pauses", () => {
  const lc = new RoundLifecycleController();
  lc.startPlaying();

  // Buffering / Cued state triggers media pause
  assert.equal(lc.handleExternalMediaPaused().action, "PAUSE_MEDIA");
  assert.equal(lc.pauseReason, "media");

  // Buffering finishes -> resumes media playback cleanly
  assert.equal(lc.handleExternalMediaPlaying().action, "RESUME_MEDIA");
  assert.equal(lc.pauseReason, null);

  // If user pauses during buffering, subsequent PLAYING event must NOT resume
  assert.equal(lc.requestPause("user"), true);
  assert.equal(lc.handleExternalMediaPlaying().action, "IGNORE");
  assert.equal(lc.pauseReason, "user");
});
