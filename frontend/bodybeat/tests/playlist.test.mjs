import test from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeInput } from "../src/utils/youtubeUrl.js";
import { GameClock } from "../src/engine/GameClock.js";
import { resolveTrackRhythm, deriveSyncSummary } from "../src/audio/syncState.js";
import { saveYouTubeBeatmap } from "../src/audio/BeatSyncEngine.js";

test("parseYouTubeInput parses playlist-only, video+playlist, shortened, YouTube Music, and invalid URLs", () => {
  assert.deepEqual(
    parseYouTubeInput("https://www.youtube.com/playlist?list=PL1234567890ABCDEF"),
    { type: "playlist", playlistId: "PL1234567890ABCDEF", requestedVideoId: null }
  );

  assert.deepEqual(
    parseYouTubeInput("https://www.youtube.com/watch?v=abc123XYZ&list=PL1234567890ABCDEF"),
    { type: "playlist", playlistId: "PL1234567890ABCDEF", requestedVideoId: "abc123XYZ" }
  );

  assert.deepEqual(
    parseYouTubeInput("https://youtu.be/abc123XYZ?list=PL1234567890ABCDEF"),
    { type: "playlist", playlistId: "PL1234567890ABCDEF", requestedVideoId: "abc123XYZ" }
  );

  assert.deepEqual(
    parseYouTubeInput("https://music.youtube.com/watch?v=worshipSong1&list=PLWorshipList123"),
    { type: "playlist", playlistId: "PLWorshipList123", requestedVideoId: "worshipSong1" }
  );

  assert.deepEqual(
    parseYouTubeInput("https://www.youtube.com/watch?v=soloVideo99"),
    { type: "video", videoId: "soloVideo99" }
  );

  assert.equal(parseYouTubeInput("not a url"), null);
  assert.equal(parseYouTubeInput("https://www.youtube.com/playlist?list="), null);
  assert.equal(parseYouTubeInput(""), null);
});

test("GameClock separates continuous Session Time from per-song Track Time across playlist track changes", () => {
  let ytTime = 0;
  const clock = new GameClock({
    getYouTubeState: () => ({ ready: true, playing: true, time: ytTime })
  });

  clock.reset("youtube");
  ytTime = 0.5;
  clock.tick();
  ytTime = 1.5;
  const t1 = clock.tick();
  assert.ok(Math.abs(t1.sessionNow - 1.5) < 1e-6);
  assert.equal(t1.trackNow, 1.5);

  // Song 2 starts at track time 0 -> resetTrack(0) resets trackNow while preserving sessionNow!
  clock.resetTrack(0);
  ytTime = 0.8;
  const t2 = clock.tick();
  assert.equal(t2.trackNow, 0.8);
  assert.ok(Math.abs(t2.sessionNow - 2.3) < 1e-6);
});

test("resolveTrackRhythm isolates per-song beatmaps and falls back to forgiving Free Play for unmapped songs", () => {
  const memStore = new Map();
  const mockStorage = {
    getItem: (k) => memStore.get(k) ?? null,
    setItem: (k, v) => memStore.set(k, v)
  };

  saveYouTubeBeatmap("mappedSongA", { bpm: 124, firstBeatSeconds: 0.4, confidence: 90 }, mockStorage);

  // Song A has a verified map -> Rhythm Matched at 124 BPM
  const resA = resolveTrackRhythm("mappedSongA", mockStorage);
  assert.equal(resA.rhythmTier, "matched");
  assert.equal(resA.bpm, 124);
  assert.equal(resA.hasPhaseLock, true);

  // Song B has no map -> does NOT reuse Song A's 124 BPM or 0.4s offset; defaults to Free Play
  const resB = resolveTrackRhythm("unmappedSongB", mockStorage);
  assert.equal(resB.rhythmTier, "free");
  assert.equal(resB.hasPhaseLock, false);
  assert.equal(resB.firstBeatSeconds, 0);

  // Playlist summary displays Continuous Dance clearly
  const summary = deriveSyncSummary({ audioSource: "youtube", isPlaylist: true });
  assert.equal(summary.state, "Continuous Dance");
});

test("deriveSyncSummary reports honest playlist statuses tied to actual player lifecycle events", () => {
  assert.equal(
    deriveSyncSummary({ audioSource: "youtube", isPlaylist: true, ytLoadState: "idle" }).detail,
    "Playlist link recognized"
  );
  assert.equal(
    deriveSyncSummary({ audioSource: "youtube", isPlaylist: true, ytLoadState: "loading" }).detail,
    "Loading music..."
  );
  assert.equal(
    deriveSyncSummary({ audioSource: "youtube", isPlaylist: true, ytLoadState: "cued" }).detail,
    "Music ready"
  );
  assert.equal(
    deriveSyncSummary({ audioSource: "youtube", isPlaylist: true, ytLoadState: "playing" }).detail,
    "Now playing"
  );
  assert.equal(
    deriveSyncSummary({ audioSource: "youtube", isPlaylist: true, ytLoadState: "error" }).detail,
    "Couldn't play this playlist"
  );
});
