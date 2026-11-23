import { test } from "node:test";
import assert from "node:assert/strict";
import { createGuidedChart, draftToRoutine, moveForMode, PRACTICE_SETTINGS, replayTip } from "../src/engine/guidedRoutine.js";
import { canSkipBlockedTrack, youtubeHelp } from "../src/engine/playerHelp.js";
import { RoundLifecycleController } from "../src/engine/RoundLifecycleController.js";

test("practice covers reach, duck and freeze within twenty seconds", () => {
  const chart = createGuidedChart(PRACTICE_SETTINGS);
  assert.deepEqual(Object.values(chart), ["reach_left", "reach_right", "duck", "freeze"]);
  assert.ok((32 + 6) * 60 / PRACTICE_SETTINGS.bpm < 20);
});

test("Joyful Praise has a repeated chorus and stays on the music through its finale", () => {
  const settings = { ...PRACTICE_SETTINGS, practice: false, duration: 90, gameMode: "auto" };
  const chart = createGuidedChart(settings);
  assert.deepEqual(Object.values(chart).slice(3, 7), Object.values(chart).slice(7, 11));
  assert.ok(Math.max(...Object.keys(chart).map(Number)) + 6 < 90 * settings.bpm / 60);
  assert.equal(createGuidedChart({ ...settings, audioSource: "youtube" }), null);
});

test("parent drafts repeat on reachable beats and support seated play", () => {
  const draft = draftToRoutine({
    name: "A Little Rhythm", duration: 30, difficulty: "easy", gameMode: "seated",
    numPlayers: 2, moves: ["reach_left", "reach_right", "reach_up", "freeze"]
  }, "draft-1");
  assert.equal(draft.guidedMoves[8], "reach_left");
  assert.equal(draft.guidedMoves[40], "reach_left");
  assert.equal(moveForMode("duck", "seated", "normal"), "reach_up");
  assert.equal(moveForMode("duck", "hands", "easy"), "reach_right");
  assert.match(replayTip({trackingPauses: 1}).text, /shoulders/);
  assert.deepEqual(replayTip({misses: 3, difficulty: "normal"}).patch, {difficulty: "easy"});
});

test("a blocked playlist track can advance while buffering, with a bounded fallback", () => {
  const round = new RoundLifecycleController();
  round.beginPreparingMedia("youtube");
  assert.equal(round.handleExternalMediaPlaying().action, "START_COUNTDOWN");
  round.startPlaying();
  const track = { code: 150, playlist: ["blocked", "second"], index: 0, attempts: 0 };
  assert.equal(canSkipBlockedTrack(track), true);
  assert.equal(round.handleExternalMediaPaused().action, "PAUSE_MEDIA");
  assert.equal(round.handleExternalMediaPlaying().action, "RESUME_MEDIA");
  assert.equal(canSkipBlockedTrack({ ...track, index: 1 }), false);
  assert.equal(canSkipBlockedTrack({ ...track, attempts: 5 }), false);
  assert.match(youtubeHelp(150), /Built-in Music/);
});
