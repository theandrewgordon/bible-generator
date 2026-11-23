/**
 * Safe, structured YouTube URL parser supporting playlists, video+playlist links,
 * shortened youtu.be links, Shorts, and YouTube Music URLs.
 */
export function parseYouTubeInput(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const isYouTubeHost =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be";

  if (!isYouTubeHost) return null;

  const rawList = parsed.searchParams.get("list")?.trim() || "";
  const playlistId = /^[A-Za-z0-9_-]{10,}$/.test(rawList) ? rawList : null;

  let rawVideo = parsed.searchParams.get("v")?.trim() || "";
  if (!rawVideo && host === "youtu.be") {
    rawVideo = parsed.pathname.replace(/^\/+/, "").split("/")[0] || "";
  }
  if (!rawVideo && parsed.pathname.includes("/shorts/")) {
    rawVideo = parsed.pathname.split("/shorts/")[1]?.split("/")[0] || "";
  }
  const videoId = /^[A-Za-z0-9_-]{6,20}$/.test(rawVideo) ? rawVideo : null;

  if (playlistId) {
    return {
      type: "playlist",
      playlistId,
      requestedVideoId: videoId || null
    };
  }

  if (videoId) {
    return {
      type: "video",
      videoId
    };
  }

  return null;
}
