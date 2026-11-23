import test from "node:test";
import assert from "node:assert/strict";
import { deriveSyncSummary, RHYTHM_MODES } from "../src/audio/syncState.js";
import { GameClock } from "../src/engine/GameClock.js";

test("deriveSyncSummary cleanly classifies Rhythm Matched, Basic Rhythm, and Free Play", () => {
  // Built-in music -> Rhythm Matched
  const builtin = deriveSyncSummary({
    audioSource: "synth",
    bpm: 128,
    hasPhaseLock: true,
    hasTempoEstimate: true
  });
  assert.equal(builtin.state, RHYTHM_MODES.RHYTHM_MATCHED);
  assert.equal(builtin.rhythmTier, "matched");

  // YouTube with verified saved beat map -> Rhythm Matched
  const verifiedYt = deriveSyncSummary({
    audioSource: "youtube",
    ytLoadState: "cued",
    bpm: 120,
    hasPhaseLock: true,
    hasTempoEstimate: true
  });
  assert.equal(verifiedYt.state, RHYTHM_MODES.RHYTHM_MATCHED);

  // Tempo estimate without beat-phase lock -> Basic Rhythm
  const basicYt = deriveSyncSummary({
    audioSource: "youtube",
    ytLoadState: "cued",
    bpm: 120,
    hasPhaseLock: false,
    hasTempoEstimate: true
  });
  assert.equal(basicYt.state, RHYTHM_MODES.BASIC_RHYTHM);
  assert.equal(basicYt.rhythmTier, "basic");

  // Unmapped YouTube video -> forgiving Free Play
  const freePlayYt = deriveSyncSummary({
    audioSource: "youtube",
    ytLoadState: "cued",
    bpm: 128,
    hasPhaseLock: false,
    hasTempoEstimate: false
  });
  assert.equal(freePlayYt.state, RHYTHM_MODES.FREE_PLAY);
  assert.equal(freePlayYt.rhythmTier, "free");
});

test("GameClock distinguishes buffering recovery from intentional seeks", () => {
  let ytPlaying = true;
  let ytTime = 10.0;
  const clock = new GameClock({
    getYouTubeState: () => ({ ready: true, playing: ytPlaying, time: ytTime })
  });
  clock.reset("youtube");

  ytTime = 10.016;
  assert.equal(clock.tick().seekDetected, false);

  // Buffering pause occurs
  ytPlaying = false;
  assert.equal(clock.tick().ready, false);

  // Buffering ends and playhead jumps 2.0s -> NOT misclassified as user seek
  ytPlaying = true;
  ytTime = 12.016;
  assert.equal(clock.tick().seekDetected, false);

  // Subsequent intentional seek while playing -> detected cleanly
  ytTime = 25.0;
  assert.equal(clock.tick().seekDetected, true);
});
