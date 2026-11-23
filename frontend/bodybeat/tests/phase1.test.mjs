import test from "node:test";
import assert from "node:assert/strict";
import { GameClock } from "../src/engine/GameClock.js";
import { AdaptivePlayerTracker } from "../src/engine/AdaptivePlayerTracker.js";

test("GameClock freezes when YouTube is unready or buffering (playing !== true)", () => {
  let ytReady = false;
  let ytPlaying = false;
  let ytTime = 0;

  const clock = new GameClock({
    getAudioTime: () => 55.5,
    getYouTubeState: () => ({ ready: ytReady, playing: ytPlaying, time: ytTime })
  });

  clock.reset("youtube");
  assert.equal(clock.tick().ready, false);

  ytReady = true;
  ytPlaying = false;
  ytTime = 4.2;
  assert.equal(clock.tick().ready, false);

  ytPlaying = true;
  const playingTick = clock.tick();
  assert.equal(playingTick.ready, true);
  assert.equal(playingTick.now, 4.2);

  ytPlaying = false;
  ytTime = 4.3;
  const bufTick = clock.tick();
  assert.equal(bufTick.ready, false);
  assert.equal(bufTick.now, 4.2);
});

test("GameClock freezes time during pause and resumes cleanly without drift", () => {
  let ytTime = 10.0;
  const clock = new GameClock({
    getAudioTime: () => 999,
    getYouTubeState: () => ({ ready: true, playing: true, time: ytTime })
  });

  clock.reset("youtube");
  ytTime = 12.5;
  assert.equal(clock.tick().now, 12.5);

  const pausedAt = clock.pause();
  assert.equal(pausedAt, 12.5);

  ytTime = 20.0;
  assert.equal(clock.tick().now, 12.5);

  const pausedDuration = clock.resume();
  assert.equal(pausedDuration, 7.5);
  assert.equal(clock.tick().now, 20.0);
});

test("GameClock detects backward and forward YouTube timeline seeks", () => {
  let ytTime = 30.0;
  const clock = new GameClock({
    getYouTubeState: () => ({ ready: true, playing: true, time: ytTime })
  });
  clock.reset("youtube");

  ytTime = 30.016;
  assert.equal(clock.tick().seekDetected, false);

  ytTime = 20.0;
  const res = clock.tick();
  assert.equal(res.seekDetected, true);
  assert.ok(Math.abs(res.seekDelta - (-10.016)) < 1e-6);
});

test("AdaptivePlayerTracker assigns Left Zone to Player 1 and Right Zone to Player 2 reliably", () => {
  const tracker = new AdaptivePlayerTracker({ hysteresisMs: 1500 });
  tracker.reset(2, 0);

  const poseLeft = { id: "LeftPlayer" };
  const poseRight = { id: "RightPlayer" };

  const assigned = tracker.assignPoses(
    [
      { lm: poseRight, cx: 0.75, cy: 0.5 },
      { lm: poseLeft, cx: 0.25, cy: 0.5 }
    ],
    2
  );
  assert.equal(assigned[0].id, "LeftPlayer");
  assert.equal(assigned[1].id, "RightPlayer");
  assert.equal(tracker.identityAmbiguous, false);
});

test("AdaptivePlayerTracker flags ambiguity on overlap/crossing and resumes cleanly when players return to their spots", () => {
  const tracker = new AdaptivePlayerTracker({ hysteresisMs: 1500 });
  tracker.reset(2, 0);

  const poseLeft = { id: "LeftPlayer" };
  const poseRight = { id: "RightPlayer" };

  // Players overlap near center -> flags identityAmbiguous so scoring pauses for "Find Your Spot!"
  tracker.assignPoses(
    [
      { lm: poseLeft, cx: 0.48, cy: 0.5 },
      { lm: poseRight, cx: 0.54, cy: 0.5 }
    ],
    2
  );
  assert.equal(tracker.identityAmbiguous, true);

  // Left player briefly steps out of frame while Right player stays on right
  const singleRight = tracker.assignPoses([{ lm: poseRight, cx: 0.74, cy: 0.5 }], 2);
  assert.equal(singleRight[0], null);
  assert.equal(singleRight[1].id, "RightPlayer");
  assert.equal(tracker.identityAmbiguous, false);

  // Left player returns to Left Zone -> ambiguity clears and both zones resume cleanly
  const separated = tracker.assignPoses(
    [
      { lm: poseLeft, cx: 0.26, cy: 0.5 },
      { lm: poseRight, cx: 0.74, cy: 0.5 }
    ],
    2
  );
  assert.equal(separated[0].id, "LeftPlayer");
  assert.equal(separated[1].id, "RightPlayer");
  assert.equal(tracker.identityAmbiguous, false);
});

test("AdaptivePlayerTracker stabilizes Auto Full-Body / Hands-Only switching with hysteresis", () => {
  const tracker = new AdaptivePlayerTracker({ bodyHysteresisMs: 2000 });
  tracker.reset(1, 0);

  assert.equal(tracker.updateBodyMode({ requestedMode: "auto", feetVisible: true, nowMs: 100 }), "hands");
  assert.equal(tracker.updateBodyMode({ requestedMode: "auto", feetVisible: true, nowMs: 2200 }), "full");
  assert.equal(tracker.updateBodyMode({ requestedMode: "auto", feetVisible: false, nowMs: 2400 }), "full");
});
