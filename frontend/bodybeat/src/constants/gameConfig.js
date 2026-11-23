export const APPROACH_BEATS = 3;
export const SMOOTHING = 0.42;

export const BASS_NOTES = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83];

// MediaPipe Pose Landmark Indices (mirrored horizontally on canvas)
// 15 & 27 sit on the LEFT side of the mirrored screen; 16 & 28 sit on the RIGHT side
export const ALL_LIMBS = [
  { id: "left_hand",  index: 15, label: "L HAND", color: "#00f0ff", zoneYFull: [0.22, 0.54], zoneYHands: [0.20, 0.72] },
  { id: "right_hand", index: 16, label: "R HAND", color: "#ff2a85", zoneYFull: [0.22, 0.54], zoneYHands: [0.20, 0.72] },
  { id: "left_foot",  index: 27, label: "L FOOT", color: "#fde047", zoneYFull: [0.66, 0.85] },
  { id: "right_foot", index: 28, label: "R FOOT", color: "#4ade80", zoneYFull: [0.66, 0.85] }
];

export const EXTRA_LANDMARKS = [
  { id: "nose", index: 0 },
  { id: "l_shoulder", index: 12 },
  { id: "r_shoulder", index: 11 },
  { id: "l_knee", index: 26 },
  { id: "r_knee", index: 25 }
];

export function getActiveLimbs(gameMode) {
  return gameMode === "hands"
    ? ALL_LIMBS.filter((l) => l.id.includes("hand"))
    : ALL_LIMBS;
}

export function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}
