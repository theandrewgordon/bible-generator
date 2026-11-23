const KEY = "bodybeat_playtest_v1";
const EVENTS = ["camera_ready", "camera_errors", "rounds_started", "rounds_finished", "tracking_pauses", "playlist_errors"];

export function getPlaytestStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return Object.fromEntries(EVENTS.map((event) => {
      const count = saved?.[event];
      return [event, Number.isInteger(count) && count >= 0 ? Math.min(count, 10000) : 0];
    }));
  } catch {
    return {};
  }
}

export function countPlaytestEvent(event) {
  try {
    const stats = getPlaytestStats();
    if (!(event in stats)) return;
    stats[event] = Math.min(stats[event] + 1, 10000);
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // Browser storage may be disabled.
  }
}
