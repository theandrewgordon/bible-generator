const ROUTINES_KEY = "volcano_run_custom_routines_v1";
const HIGHSCORES_KEY = "volcano_run_highscores_v1";

export function loadSavedRoutines() {
  try {
    const raw = localStorage.getItem(ROUTINES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRoutine(routine) {
  const existing = loadSavedRoutines();
  const filtered = existing.filter((r) => r.id !== routine.id);
  const updated = [routine, ...filtered];
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(updated));
  return updated;
}

export function deleteRoutine(id) {
  const updated = loadSavedRoutines().filter((r) => r.id !== id);
  localStorage.setItem(ROUTINES_KEY, JSON.stringify(updated));
  return updated;
}

export function exportRoutineJson(routine) {
  const blob = new Blob([JSON.stringify(routine, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = routine.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  a.href = url;
  a.download = `${slug || "routine"}-beatmap.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importRoutineFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.events)) {
    throw new Error("Invalid routine JSON format (missing events array).");
  }
  const normalized = {
    id: parsed.id || `routine_${Date.now()}`,
    name: parsed.name || file.name.replace(/\.json$/i, ""),
    bpm: Number(parsed.bpm) || 120,
    themeId: parsed.themeId || "worship",
    gameMode: parsed.gameMode || "full",
    youtubeUrl: parsed.youtubeUrl || "",
    events: parsed.events
  };
  return saveRoutine(normalized);
}

export function getHighScoreKey(settings) {
  const trackKey =
    settings.activeRoutineId ||
    (settings.audioSource === "youtube"
      ? settings.youtubeSource?.videoId || settings.youtubeSource?.listId || "yt"
      : settings.trackId || "custom");
  return `${settings.themeId}:${settings.gameMode}:${settings.numPlayers}p:${trackKey}`;
}

export function getHighScore(settings) {
  try {
    const map = JSON.parse(localStorage.getItem(HIGHSCORES_KEY) || "{}");
    return map[getHighScoreKey(settings)] || 0;
  } catch {
    return 0;
  }
}

export function recordHighScore(settings, score) {
  try {
    const map = JSON.parse(localStorage.getItem(HIGHSCORES_KEY) || "{}");
    const key = getHighScoreKey(settings);
    const prev = map[key] || 0;
    const isNewRecord = score > prev && score > 0;
    if (isNewRecord) {
      map[key] = score;
      localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(map));
    }
    return { best: Math.max(prev, score), isNewRecord };
  } catch {
    return { best: score, isNewRecord: false };
  }
}
