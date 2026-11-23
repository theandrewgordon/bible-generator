export const GUIDED_TRACK = "joyful-praise";
export const GUIDED_BPM = 118;
export const PRACTICE_SETTINGS = {
  practice: true,
  audioSource: "synth",
  trackId: GUIDED_TRACK,
  bpm: GUIDED_BPM,
  duration: 20,
  difficulty: "easy",
  activeRoutine: null,
  activeRoutineId: null,
  youtubeSource: null,
  isRecording: false
};

export const MOVE_CUES = {
  reach_left: { text: "Reach left", icon: "←" },
  reach_right: { text: "Reach right", icon: "→" },
  reach_up: { text: "Reach up", icon: "↑" },
  duck: { text: "Duck", icon: "↓" },
  freeze: { text: "Freeze", icon: "✦" }
};

const PRACTICE = [
  [8, "reach_left"], [16, "reach_right"], [24, "duck"], [32, "freeze"]
];
const INTRO = [[8, "reach_left"], [16, "reach_right"], [24, "reach_up"]];
const CHORUS = [[0, "reach_left"], [8, "reach_right"], [16, "duck"], [24, "freeze"]];
const FINALE = [[0, "reach_right"], [8, "reach_left"], [16, "reach_up"], [24, "freeze"]];

export function createGuidedChart(settings) {
  if (settings.audioSource !== "synth" || settings.isRecording) return null;
  if (settings.activeRoutine?.guidedMoves) return settings.activeRoutine.guidedMoves;
  if (settings.activeRoutine) return null;
  if (settings.trackId !== GUIDED_TRACK && !["hands", "seated"].includes(settings.gameMode)) return null;

  const totalBeats = Math.floor(settings.duration * settings.bpm / 60);
  if (settings.practice) return Object.fromEntries(PRACTICE);
  const finaleStart = Math.floor((totalBeats - 32) / 8) * 8;
  const entries = [...INTRO];
  for (let start = 32; start < finaleStart; start += 32) {
    entries.push(...CHORUS.filter(([beat]) => start + beat < finaleStart).map(([beat, move]) => [start + beat, move]));
  }
  if (finaleStart >= 32) entries.push(...FINALE.map(([beat, move]) => [finaleStart + beat, move]));
  return Object.fromEntries(entries.filter(([beat]) => beat + 7 < totalBeats));
}

export function moveForMode(move, gameMode, difficulty) {
  const adapted = move === "duck" && ["hands", "seated"].includes(gameMode) ? "reach_up" : move;
  return adapted === "reach_up" && difficulty === "easy" ? "reach_right" : adapted;
}

export function moveTargets(move) {
  if (move === "reach_left") return [["left_hand", 0.28, 0.41]];
  if (move === "reach_right") return [["right_hand", 0.72, 0.41]];
  if (move === "reach_up") return [["left_hand", 0.28, 0.28], ["right_hand", 0.72, 0.28]];
  return [];
}

export function draftToRoutine(draft, id) {
  const endBeat = Math.floor(draft.duration * GUIDED_BPM / 60);
  const guidedMoves = {};
  for (let beat = 8, index = 0; beat + 7 < endBeat; beat += 8, index++) {
    guidedMoves[beat] = draft.moves[index % draft.moves.length];
  }
  return {
    id, name: draft.name, bpm: GUIDED_BPM, duration: draft.duration,
    difficulty: draft.difficulty, gameMode: draft.gameMode, numPlayers: draft.numPlayers,
    events: [], guidedMoves
  };
}

export function replayTip({ trackingPauses, misses, difficulty, gameMode }) {
  if (trackingPauses > 0) return { text: "Keep your shoulders and hands in the picture." };
  if (misses >= 3 && difficulty !== "easy") {
    return { text: "Try bigger targets next round.", patch: { difficulty: "easy" } };
  }
  if (misses >= 3 && gameMode !== "hands" && gameMode !== "seated") {
    return { text: "Try reaching with just your hands.", patch: { gameMode: "hands" } };
  }
  return null;
}
