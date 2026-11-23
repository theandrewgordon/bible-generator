const EMBEDDING_ERRORS = new Set([100, 101, 150]);

export function youtubeHelp(code) {
  if (EMBEDDING_ERRORS.has(code)) return "This song can’t play here. Choose another link or use Built-in Music.";
  if (code === 2) return "Paste a YouTube song or playlist link, or use Built-in Music.";
  if (code === 153) return "Open BodyBeat directly in your browser, then try the link again.";
  return "Try another YouTube link or switch to Built-in Music.";
}

export function canSkipBlockedTrack({ code, playlist, index, attempts }) {
  return EMBEDDING_ERRORS.has(code) && Array.isArray(playlist)
    && index >= 0 && index < playlist.length - 1 && attempts < 5;
}
