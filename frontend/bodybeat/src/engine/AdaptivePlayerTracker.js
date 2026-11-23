/**
 * Simple, bulletproof two-player zone tracker:
 * - Player 1 owns the Left Zone (cx < 0.5); Player 2 owns the Right Zone (cx >= 0.5).
 * - If two players overlap near the center or cross sides, sets `identityAmbiguous = true`
 *   so gameplay pauses scoring with a friendly "Find Your Spot!" prompt instead of guessing
 *   or swapping scores.
 */
export class AdaptivePlayerTracker {
  constructor({ hysteresisMs = 1500, bodyHysteresisMs = 2000 } = {}) {
    this.hysteresisMs = hysteresisMs;
    this.bodyHysteresisMs = bodyHysteresisMs;

    this.effectivePlayers = 1;
    this.candidatePlayers = 1;
    this.candidateSinceMs = 0;

    this.identityAmbiguous = false;
    this.lastSingleCenterX = 0.5;

    this.effectiveBodyMode = "hands";
    this.candidateBodyMode = "hands";
    this.bodyCandidateSinceMs = 0;
  }

  reset(selectedCapacity = 1, nowMs = 0) {
    this.effectivePlayers = 1;
    this.candidatePlayers = selectedCapacity === 2 ? 1 : 1;
    this.candidateSinceMs = nowMs;
    this.identityAmbiguous = false;
    this.lastSingleCenterX = 0.5;

    this.effectiveBodyMode = "hands";
    this.candidateBodyMode = "hands";
    this.bodyCandidateSinceMs = nowMs;
  }

  /**
   * Assigns poses to Player 0 (Left) and Player 1 (Right).
   * Flags `identityAmbiguous = true` when two players overlap or cross into the same side.
   */
  assignPoses(detectedItems, selectedCapacity) {
    this.identityAmbiguous = false;

    if (!detectedItems || detectedItems.length === 0) {
      return [null, null];
    }

    if (selectedCapacity === 1) {
      let chosen = detectedItems[0];
      if (detectedItems.length > 1) {
        let bestDist = Infinity;
        for (const item of detectedItems) {
          const d = Math.abs(item.cx - this.lastSingleCenterX);
          if (d < bestDist) {
            bestDist = d;
            chosen = item;
          }
        }
      }
      this.lastSingleCenterX = chosen.cx;
      return [chosen.lm, null];
    }

    // 2-Player capacity
    if (detectedItems.length === 1) {
      const only = detectedItems[0];
      if (only.cx < 0.5) {
        return [only.lm, null];
      }
      return [null, only.lm];
    }

    // 2 or more people detected: sort left-to-right
    const sorted = [...detectedItems].sort((a, b) => a.cx - b.cx);
    const leftMost = sorted[0];
    const rightMost = sorted[1];

    // Ambiguous if players are tightly overlapping (< 0.14 width apart) or both squeezed onto the same half
    const separation = Math.abs(rightMost.cx - leftMost.cx);
    const bothOnLeft = leftMost.cx < 0.46 && rightMost.cx < 0.48;
    const bothOnRight = leftMost.cx > 0.52 && rightMost.cx > 0.54;

    if (separation < 0.14 || bothOnLeft || bothOnRight) {
      this.identityAmbiguous = true;
    }

    return [leftMost.lm, rightMost.lm];
  }

  update({ selectedCapacity, detectedCount, p0Visible, p1Visible, nowMs }) {
    if (selectedCapacity === 1) {
      const changed = this.effectivePlayers !== 1;
      this.effectivePlayers = 1;
      return {
        effectivePlayers: 1,
        activePlayerIndices: [0],
        layoutChanged: changed,
        identityAmbiguous: false
      };
    }

    const desired = detectedCount >= 2 ? 2 : 1;
    if (desired !== this.candidatePlayers) {
      this.candidatePlayers = desired;
      this.candidateSinceMs = nowMs;
    }

    let layoutChanged = false;
    if (
      this.candidatePlayers !== this.effectivePlayers &&
      nowMs - this.candidateSinceMs >= this.hysteresisMs
    ) {
      this.effectivePlayers = this.candidatePlayers;
      layoutChanged = true;
    }

    if (this.effectivePlayers === 2) {
      return {
        effectivePlayers: 2,
        activePlayerIndices: [0, 1],
        layoutChanged,
        identityAmbiguous: this.identityAmbiguous
      };
    }

    const activeIdx = !p0Visible && p1Visible ? 1 : 0;
    return {
      effectivePlayers: 1,
      activePlayerIndices: [activeIdx],
      layoutChanged,
      identityAmbiguous: false
    };
  }

  updateBodyMode({ requestedMode, feetVisible, nowMs }) {
    if (requestedMode === "seated") requestedMode = "hands";
    if (requestedMode === "hands" || requestedMode === "full") {
      this.effectiveBodyMode = requestedMode;
      this.candidateBodyMode = requestedMode;
      return requestedMode;
    }

    const desired = feetVisible ? "full" : "hands";
    if (desired !== this.candidateBodyMode) {
      this.candidateBodyMode = desired;
      this.bodyCandidateSinceMs = nowMs;
    }

    if (
      this.candidateBodyMode !== this.effectiveBodyMode &&
      nowMs - this.bodyCandidateSinceMs >= this.bodyHysteresisMs
    ) {
      this.effectiveBodyMode = this.candidateBodyMode;
    }

    return this.effectiveBodyMode;
  }
}
