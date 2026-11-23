import test from "node:test";
import assert from "node:assert/strict";
import { ChallengeScheduler } from "../src/engine/ChallengeScheduler.js";

test("ChallengeScheduler follows coherent 24-beat Reach -> Dodge -> Freeze cadence", () => {
  const sched = new ChallengeScheduler();

  // Beat 0..22: standard Reach targets on even beats
  assert.deepEqual(
    sched.evaluateBeat({ beatNum: 2, hasActiveChallenge: false, hasActiveTraces: false }),
    { type: "REACH" }
  );

  // Beat 24: First group challenge (Dodge floor / Lava)
  assert.deepEqual(
    sched.evaluateBeat({ beatNum: 24, hasActiveChallenge: false, hasActiveTraces: false }),
    { type: "CHALLENGE", challengeType: "LAVA" }
  );

  // Beat 48: Second group challenge (Freeze Dance)
  assert.deepEqual(
    sched.evaluateBeat({ beatNum: 48, hasActiveChallenge: false, hasActiveTraces: false }),
    { type: "CHALLENGE", challengeType: "FREEZE" }
  );

  // Beat 72: Third group challenge (Overhead Duck)
  assert.deepEqual(
    sched.evaluateBeat({ beatNum: 72, hasActiveChallenge: false, hasActiveTraces: false }),
    { type: "CHALLENGE", challengeType: "DUCK" }
  );
});

test("ChallengeScheduler never overlaps an active challenge and schedules occasional trace bonuses", () => {
  const sched = new ChallengeScheduler();

  // While a challenge is active, scheduler suppresses new spawns
  assert.deepEqual(
    sched.evaluateBeat({ beatNum: 26, hasActiveChallenge: true, hasActiveTraces: false }),
    { type: "NONE" }
  );

  // Beat 36: Occasional bonus Trace Ribbon
  assert.deepEqual(
    sched.evaluateBeat({ beatNum: 36, hasActiveChallenge: false, hasActiveTraces: false }),
    { type: "TRACE", shapeIdx: 0 }
  );
});
