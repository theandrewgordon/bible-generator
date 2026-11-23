/**
 * Coherent 24-beat movement phrase scheduler:
 * - Beats 0..15: Core rhythmic Reach targets (with an occasional Trace Ribbon every 48 beats)
 * - Beat 16..22: One clear group challenge cycling through Dodge (LAVA/DUCK), Freeze, and occasional Power Gate
 * - Prevents overlapping challenges and gives younger players steady, predictable dance phrases.
 */
export class ChallengeScheduler {
  constructor() {
    this.cycleIndex = 0;
  }

  reset() {
    this.cycleIndex = 0;
  }

  /**
   * Evaluates what action should trigger on `beatNum`.
   * Returns:
   * - { type: "NONE" }
   * - { type: "CHALLENGE", challengeType: "LAVA" | "DUCK" | "FREEZE" | "GATE" }
   * - { type: "TRACE", shapeIdx: number }
   * - { type: "REACH" }
   */
  evaluateBeat({ beatNum, hasActiveChallenge, hasActiveTraces, difficulty = "normal" }) {
    if (hasActiveChallenge) {
      return { type: "NONE" };
    }

    // Trigger one clear special challenge every 24 beats (instead of every 12-16 beats)
    if (beatNum > 0 && beatNum % 24 === 0) {
      const idx = this.cycleIndex++;
      // Core rotation: Dodge (Floor/Overhead) -> Freeze -> Dodge -> Bonus Power Gate
      const sequence =
        difficulty === "easy"
          ? ["LAVA", "FREEZE", "DUCK", "FREEZE"]
          : ["LAVA", "FREEZE", "DUCK", "GATE"];
      return {
        type: "CHALLENGE",
        challengeType: sequence[idx % sequence.length]
      };
    }

    // Occasional bonus Trace Ribbon halfway through every second phrase (beat 36, 84, ...)
    if (beatNum > 0 && beatNum % 48 === 36 && !hasActiveTraces) {
      return {
        type: "TRACE",
        shapeIdx: Math.floor(beatNum / 48)
      };
    }

    // Standard Reach targets on even beats when no trace ribbon is active
    if (beatNum % 2 === 0 && !hasActiveTraces) {
      return { type: "REACH" };
    }

    return { type: "NONE" };
  }
}
