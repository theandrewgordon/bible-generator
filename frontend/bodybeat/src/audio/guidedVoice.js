import { MOVE_CUES } from "../engine/guidedRoutine";
import { speakCoach } from "./voiceCoach";

const clips = new Map();
let loading;

export async function bodyBeatCsrf() {
  const response = await fetch("/labs/voice/session");
  if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("Sign in to Faith Sparks Labs and try again.");
  }
  const { csrf } = await response.json();
  return csrf;
}

export function preloadCoachCues() {
  if (loading) return loading;
  loading = bodyBeatCsrf().then(async (csrf) => {
    await Promise.allSettled(Object.values(MOVE_CUES).map(async ({ text }) => {
      if (clips.has(text)) return;
      const response = await fetch("/labs/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ game: "bodybeat", text })
      });
      if (response.ok && response.headers.get("Content-Type")?.includes("audio/mpeg")) {
        clips.set(text, new Audio(URL.createObjectURL(await response.blob())));
      }
    }));
  }).catch(() => {}).finally(() => { loading = null; });
  return loading;
}

export function playCoachCue(text) {
  const clip = clips.get(text);
  if (!clip) {
    speakCoach(text);
    return;
  }
  clip.currentTime = 0;
  clip.play().catch(() => speakCoach(text));
}
