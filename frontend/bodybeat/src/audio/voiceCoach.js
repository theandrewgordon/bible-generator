export function speakCoach(text, enabled = true) {
  if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.12;
    utter.pitch = 1.15;
    utter.volume = 0.95;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore on restricted browsers
  }
}
