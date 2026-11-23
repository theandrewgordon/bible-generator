import { useRef, useState } from "react";
import { ParentTools } from "./ParentTools";
import { draftToRoutine, GUIDED_TRACK } from "../engine/guidedRoutine";
import { THEMES } from "../constants/themes";
import { SAMPLE_TRACKS } from "../constants/sampleTracks";
import { parseYouTubeInput } from "../utils/youtubeUrl";
import {
  deleteRoutine,
  exportRoutineJson,
  getHighScore,
  importRoutineFile,
  saveRoutine
} from "../storage/routineStorage";
import { resolveTrackRhythm, deriveSyncSummary } from "../audio/syncState";

export function LobbyOverlay({
  aiReady,
  framingStatus,
  resolvedBodyMode,
  settings,
  onUpdateSettings,
  savedRoutines,
  onRoutinesChanged,
  onAudioFileSelected,
  onClearCustomAudio,
  micLearning,
  micMode,
  micLevel,
  beatFlash,
  onStartAudioLearner,
  onStopAudioLearner,
  hasReturningPlaylist,
  onStart,
  onStartPractice
}) {
  const [musicCategory, setMusicCategory] = useState(() => {
    if (settings.audioSource === "youtube") return "youtube";
    if (settings.audioSource === "mp3" || settings.activeRoutineId) return "mymusic";
    return "builtin";
  });
  const [showStudio, setShowStudio] = useState(false);
  const [studioTab, setStudioTab] = useState("customize");
  const [trackName, setTrackName] = useState("");
  const [ytInput, setYtInput] = useState(settings.youtubeUrl || "");
  const [ytHint, setYtHint] = useState("");
  const [tapCount, setTapCount] = useState(0);
  const tapTimesRef = useRef([]);

  const activeTheme = THEMES[settings.themeId] || THEMES.volcano;
  const bestScore = getHighScore(settings);
  const isPlaylist = settings.youtubeSource?.type === "playlist";

  const syncSummary = deriveSyncSummary({
    audioSource: settings.audioSource,
    isPlaylist,
    ytLoadState: settings.ytLoadState || "idle",
    bpm: settings.bpm,
    hasPhaseLock: Boolean(settings.hasPhaseLock),
    hasTempoEstimate: Boolean(settings.hasTempoEstimate),
    isAnalyzing: Boolean(settings.isAnalyzingAudio || micLearning)
  });

  const handleThemeChange = (newThemeId) => {
    const patch = { themeId: newThemeId };
    if (musicCategory === "builtin" && !settings.activeRoutine) {
      if (newThemeId === "worship") {
        patch.trackId = "joyful-praise";
        patch.bpm = 118;
      } else if (newThemeId === "space") {
        patch.trackId = "jungle-sprint";
        patch.bpm = 136;
      } else {
        patch.trackId = "volcano-dash";
        patch.bpm = 128;
      }
      patch.hasPhaseLock = true;
      patch.hasTempoEstimate = true;
      patch.syncConfidence = 100;
    }
    onUpdateSettings(patch);
  };

  const handleSelectCategory = (cat) => {
    setMusicCategory(cat);
    setYtHint("");
    if (cat === "builtin") {
      onClearCustomAudio?.();
      const found = SAMPLE_TRACKS.find((t) => t.id === settings.trackId) || SAMPLE_TRACKS[0];
      onUpdateSettings({
        audioSource: "synth",
        trackId: found.id,
        bpm: found.bpm,
        hasPhaseLock: true,
        hasTempoEstimate: true,
        syncConfidence: 100,
        youtubeSource: null,
        activeRoutine: null,
        activeRoutineId: null
      });
    } else if (cat === "youtube") {
      const parsed = parseYouTubeInput(ytInput);
      const vidForRhythm = parsed?.type === "video" ? parsed.videoId : parsed?.requestedVideoId;
      const resolved = resolveTrackRhythm(vidForRhythm);
      onUpdateSettings({
        audioSource: "youtube",
        youtubeSource: parsed,
        activeRoutine: null,
        activeRoutineId: null,
        bpm: resolved.bpm,
        firstBeatSeconds: resolved.firstBeatSeconds,
        hasPhaseLock: resolved.hasPhaseLock,
        hasTempoEstimate: resolved.hasTempoEstimate,
        syncConfidence: resolved.confidence
      });
    } else if (cat === "mymusic") {
      onUpdateSettings({
        audioSource: trackName ? "mp3" : "synth",
        youtubeSource: null,
        hasPhaseLock: Boolean(trackName || settings.activeRoutineId),
        hasTempoEstimate: Boolean(trackName || settings.activeRoutineId),
        syncConfidence: trackName ? settings.syncConfidence : 0
      });
    }
  };

  const handleSampleTrackChange = (trackId) => {
    const found = SAMPLE_TRACKS.find((t) => t.id === trackId);
    if (!found) return;
    setTrackName("");
    onClearCustomAudio?.();
    onUpdateSettings({
      audioSource: "synth",
      trackId: found.id,
      bpm: found.bpm,
      hasPhaseLock: true,
      hasTempoEstimate: true,
      syncConfidence: 100,
      youtubeSource: null,
      activeRoutine: null,
      activeRoutineId: null
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMusicCategory("mymusic");
    setTrackName(file.name);
    onUpdateSettings({
      audioSource: "mp3",
      youtubeSource: null,
      activeRoutine: null,
      activeRoutineId: null,
      isAnalyzingAudio: true,
      hasPhaseLock: false,
      hasTempoEstimate: false,
      syncConfidence: 0
    });
    const analysis = await onAudioFileSelected(file);
    if (analysis) {
      onUpdateSettings({
        bpm: analysis.bpm,
        firstBeatSeconds: analysis.firstBeatSeconds,
        syncConfidence: analysis.confidence,
        phraseIntensity: analysis.phraseIntensity,
        hasPhaseLock: analysis.confidence >= 75,
        hasTempoEstimate: true,
        isAnalyzingAudio: false
      });
    } else {
      onUpdateSettings({ isAnalyzingAudio: false });
    }
  };

  const handleYouTubeChange = (val) => {
    setYtInput(val);
    setYtHint("");
    if (!val.trim()) {
      onUpdateSettings({
        youtubeUrl: "",
        youtubeSource: null,
        hasPhaseLock: false,
        hasTempoEstimate: false,
        syncConfidence: 0
      });
      return;
    }

    const parsed = parseYouTubeInput(val);
    if (parsed) {
      const vidForRhythm = parsed.type === "video" ? parsed.videoId : parsed.requestedVideoId;
      const resolved = resolveTrackRhythm(vidForRhythm);
      onUpdateSettings({
        audioSource: "youtube",
        youtubeUrl: val,
        youtubeSource: parsed,
        phraseIntensity: null,
        bpm: resolved.bpm,
        firstBeatSeconds: resolved.firstBeatSeconds,
        hasPhaseLock: resolved.hasPhaseLock,
        hasTempoEstimate: resolved.hasTempoEstimate,
        syncConfidence: resolved.confidence
      });
    } else {
      setYtHint("Paste a valid YouTube playlist or video link.");
      onUpdateSettings({
        youtubeUrl: val,
        youtubeSource: null,
        hasPhaseLock: false,
        hasTempoEstimate: false,
        syncConfidence: 0
      });
    }
  };

  const useGuidedRoutine = (routine) => {
    setMusicCategory("mymusic");
    onUpdateSettings({
      activeRoutine: routine,
      activeRoutineId: routine.id,
      trackId: GUIDED_TRACK,
      audioSource: "synth",
      youtubeSource: null,
      youtubeUrl: "",
      bpm: routine.bpm,
      duration: routine.duration,
      difficulty: routine.difficulty,
      numPlayers: routine.numPlayers,
      gameMode: routine.gameMode,
      isRecording: false,
      hasPhaseLock: true,
      hasTempoEstimate: true,
      syncConfidence: 100
    });
  };

  const handleSelectRoutine = (routineId) => {
    if (!routineId) {
      onUpdateSettings({ activeRoutine: null, activeRoutineId: null });
      return;
    }
    const found = savedRoutines.find((r) => r.id === routineId);
    if (!found) return;
    if (found.guidedMoves) {
      useGuidedRoutine(found);
      return;
    }
    applyRecordedRoutine(found);
  };

  const applyRecordedRoutine = (found) => {
    const ytParsed = found.youtubeUrl ? parseYouTubeInput(found.youtubeUrl) : null;
    if (found.youtubeUrl) setYtInput(found.youtubeUrl);

    onUpdateSettings({
      activeRoutine: found,
      activeRoutineId: found.id,
      bpm: found.bpm,
      themeId: found.themeId || settings.themeId,
      gameMode: found.gameMode || settings.gameMode,
      isRecording: false,
      hasPhaseLock: true,
      hasTempoEstimate: true,
      syncConfidence: 90,
      ...(ytParsed
        ? { audioSource: "youtube", youtubeUrl: found.youtubeUrl, youtubeSource: ytParsed }
        : {})
    });
  };

  const handleImportJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const updated = await importRoutineFile(file);
      onRoutinesChanged(updated);
      if (updated[0]) {
        setMusicCategory("mymusic");
        if (updated[0].guidedMoves) useGuidedRoutine(updated[0]);
        else applyRecordedRoutine(updated[0]);
      }
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;

    if (taps.length > 0 && now - taps[taps.length - 1] > 2500) {
      tapTimesRef.current = [];
    }

    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > 10) {
      tapTimesRef.current.shift();
    }

    setTapCount(tapTimesRef.current.length);

    if (tapTimesRef.current.length >= 3) {
      const intervals = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      intervals.sort((a, b) => a - b);
      const medianMs = intervals[Math.floor(intervals.length / 2)];
      const tappedBpm = Math.min(190, Math.max(70, Math.round(60000 / medianMs)));
      onUpdateSettings({
        bpm: tappedBpm,
        hasTempoEstimate: true,
        hasPhaseLock: false
      });
    }
  };

  return (
    <div className="fullscreen-overlay transparent-lobby">
      <div className="subtitle">
        <a href="/labs">Faith Sparks Labs</a> / BodyBeat {bestScore > 0 ? `• 🏆 ${bestScore}` : ""}
      </div>
      <h1>{activeTheme.title}</h1>

      <div className="setup-card">
        {/* 1. Choose Adventure */}
        <div className="selector-row" role="group" aria-label="Choose Adventure">
          {Object.values(THEMES).map((th) => (
            <button
              key={th.id}
              type="button"
              className={`toggle-btn big-kid-btn ${settings.themeId === th.id ? "active" : ""}`}
              onClick={() => handleThemeChange(th.id)}
            >
              {th.label}
            </button>
          ))}
        </div>

        {/* 2. Choose Music (Built-In, YouTube Playlist/Video, My Music) */}
        <div className="selector-row" role="group" aria-label="Choose Music Source">
          <button
            type="button"
            className={`toggle-btn ${musicCategory === "builtin" ? "active" : ""}`}
            onClick={() => handleSelectCategory("builtin")}
          >
            🎵 Built-in Music
          </button>
          <button
            type="button"
            className={`toggle-btn ${musicCategory === "youtube" ? "active" : ""}`}
            onClick={() => handleSelectCategory("youtube")}
          >
            ▶️ YouTube Playlist / Song
          </button>
          <button
            type="button"
            className={`toggle-btn ${musicCategory === "mymusic" ? "active" : ""}`}
            onClick={() => handleSelectCategory("mymusic")}
          >
            📂 My Music
          </button>
        </div>

        {musicCategory === "builtin" && (
          <select
            className="track-select"
            value={settings.trackId}
            onChange={(e) => handleSampleTrackChange(e.target.value)}
          >
            {SAMPLE_TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}

        {musicCategory === "youtube" && (
          <div className="yt-setup-box">
            <div className="sample-pack-box">
              <input
                type="text"
                className="yt-url-input"
                placeholder="Paste your YouTube worship playlist or song link..."
                value={ytInput}
                onChange={(e) => handleYouTubeChange(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData?.getData("text");
                  if (pasted) {
                    e.preventDefault();
                    handleYouTubeChange(pasted);
                  }
                }}
              />
              {ytInput && (
                <button
                  type="button"
                  className="mini-icon-btn"
                  onClick={() => handleYouTubeChange("")}
                >
                  ✕
                </button>
              )}
            </div>
            {ytHint && (
              <span className="sync-meta" style={{ color: "#fb923c" }}>
                {ytHint}
              </span>
            )}
          </div>
        )}

        {musicCategory === "mymusic" && (
          <div className="sample-pack-box">
            <label className="file-label" htmlFor="audio-file" style={{ flex: 1, textAlign: "center" }}>
              {trackName ? `🎵 ${trackName}` : "📂 Choose Song File (MP3 / WAV)"}
            </label>
            <input id="audio-file" type="file" accept="audio/*" onChange={handleFileChange} />

            {savedRoutines.length > 0 && (
              <select
                className="track-select"
                style={{ flex: 1 }}
                value={settings.activeRoutineId || ""}
                onChange={(e) => handleSelectRoutine(e.target.value)}
              >
                <option value="">Auto Choreography</option>
                {savedRoutines.map((r) => (
                  <option key={r.id} value={r.id}>
                    💃 {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Clean Family Music Status */}
        <div className="sync-status-card">
          <div className="sync-pill-row">
            <span className={`sync-state-badge ${syncSummary.badgeTone === "ok" ? "locked" : "found"}`}>{syncSummary.state}</span>
            <span className="sync-meta">{syncSummary.detail}</span>
          </div>
        </div>

        {/* Simple Player & Automatic Status Bar */}
        <div className="simple-music-bar">
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="music-ready-pill mode-quick-pill"
              onClick={() =>
                onUpdateSettings({ numPlayers: settings.numPlayers === 1 ? 2 : 1 })
              }
            >
              {settings.numPlayers === 2 ? "👥 2 Players (Auto)" : "👤 1 Player"}
            </button>

            <span className="sync-meta" style={{ fontSize: "0.74rem" }}>
              {framingStatus === "SEARCHING"
                ? "• Step into view"
                : resolvedBodyMode === "full"
                  ? "• Full body detected"
                  : "• Upper body ready"}
            </span>
          </div>

          <button
            type="button"
            className="text-link-btn"
            onClick={() => setShowStudio((v) => !v)}
          >
            {showStudio ? "▲ Done" : "⚙️ Parent & Creator"}
          </button>
        </div>

        {/* Collapsible Parent & Creator Studio */}
        {showStudio && (
          <div className="creator-drawer">
            <div className="selector-row">
              <button
                type="button"
                className={`toggle-btn ${studioTab === "customize" ? "active" : ""}`}
                onClick={() => setStudioTab("customize")}
              >
                🎚 CUSTOMIZE & SYNC
              </button>
              <button
                type="button"
                className={`toggle-btn ${studioTab === "create" ? "active" : ""}`}
                onClick={() => setStudioTab("create")}
              >
                🎬 CREATOR ROUTINES
              </button>
            </div>

            {studioTab === "customize" ? (
              <>
                <div className="dual-row">
                  <div className="selector-row" role="group" aria-label="Difficulty">
                    {["easy", "normal", "challenge"].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        className={`toggle-btn ${(settings.difficulty || "normal") === lvl ? "active" : ""}`}
                        onClick={() => onUpdateSettings({ difficulty: lvl })}
                      >
                        {lvl.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <div className="selector-row" role="group" aria-label="Movement Mode">
                    {[
                      { id: "auto", label: "AUTO" },
                      { id: "full", label: "FULL" },
                      { id: "hands", label: "HANDS" },
                      { id: "seated", label: "SEATED" }
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`toggle-btn ${(settings.gameMode || "auto") === m.id ? "active" : ""}`}
                        onClick={() => onUpdateSettings({ gameMode: m.id })}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="tempo-learn-row">
                  {micLearning ? (
                    <button
                      type="button"
                      className="mic-learn-btn listening"
                      onClick={onStopAudioLearner}
                    >
                      ⏹ STOP ({micMode === "tab" ? "TAB" : "MIC"})
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="mic-learn-btn"
                        onClick={() => onStartAudioLearner("tab")}
                      >
                        🖥️ TAB LISTEN
                      </button>
                      <button
                        type="button"
                        className="mic-learn-btn"
                        onClick={() => onStartAudioLearner("mic")}
                      >
                        🎤 MIC LISTEN
                      </button>
                    </>
                  )}

                  <button type="button" className="tap-btn" onClick={handleTapTempo}>
                    {tapCount > 0 ? `👆 ${tapCount}/10` : "👆 TAP BPM"}
                  </button>

                  <div className="bpm-box">
                    <span>BPM:</span>
                    <input
                      id="bpm-input"
                      type="number"
                      min="70"
                      max="190"
                      value={settings.bpm}
                      onChange={(e) =>
                        onUpdateSettings({
                          bpm: Math.min(190, Math.max(70, Number(e.target.value) || 125)),
                          hasTempoEstimate: true,
                          hasPhaseLock: false
                        })
                      }
                    />
                  </div>
                </div>

                {micLearning && (
                  <div className="mic-status-row">
                    <span className={`beat-led ${beatFlash ? "on" : ""}`}>BEAT</span>
                    <div className="mic-meter-wrap">
                      <div className="mic-meter-fill" style={{ width: `${micLevel}%` }} />
                    </div>
                  </div>
                )}

                <div className="dual-row">
                  <div className="selector-row" role="group" aria-label="Duration">
                    {[
                      { sec: 60, label: "60S" },
                      { sec: 90, label: "90S" },
                      { sec: 180, label: "3M" }
                    ].map((opt) => (
                      <button
                        key={opt.sec}
                        type="button"
                        className={`toggle-btn ${settings.duration === opt.sec ? "active" : ""}`}
                        onClick={() => onUpdateSettings({ duration: opt.sec })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={`mini-icon-btn ${settings.voiceCoach ? "frame-ready-btn" : ""}`}
                    onClick={() => onUpdateSettings({ voiceCoach: !settings.voiceCoach })}
                  >
                    {settings.voiceCoach ? "Voice coach on" : "Voice coach off"}
                  </button>
                </div>
                {settings.voiceCoach && <small>Announcer clips use an AI-generated voice when available.</small>}
              </>
            ) : (
              <div className="routine-box" style={{ borderTop: "none", paddingTop: 0 }}>
                <ParentTools onUseRoutine={(draft) => {
                  const routine = draftToRoutine(draft, crypto.randomUUID());
                  onRoutinesChanged(saveRoutine(routine));
                  useGuidedRoutine(routine);
                  setShowStudio(false);
                }} />
                <div className="record-toggle-row">
                  <button
                    type="button"
                    className={`record-pill-btn ${settings.isRecording ? "recording" : ""}`}
                    onClick={() =>
                      onUpdateSettings({
                        isRecording: !settings.isRecording,
                        activeRoutine: null,
                        activeRoutineId: null
                      })
                    }
                  >
                    {settings.isRecording ? "⏺ RECORDING ON" : "⏺ RECORD NEW ROUTINE"}
                  </button>

                  {settings.isRecording && (
                    <input
                      type="text"
                      className="routine-name-input"
                      placeholder="Routine name..."
                      value={settings.routineName || ""}
                      onChange={(e) => onUpdateSettings({ routineName: e.target.value })}
                    />
                  )}
                </div>

                <div className="record-toggle-row">
                  {settings.activeRoutine && (
                    <>
                      <button
                        type="button"
                        className="mini-icon-btn"
                        onClick={() => exportRoutineJson(settings.activeRoutine)}
                      >
                        ⬇️ EXPORT JSON
                      </button>
                      <button
                        type="button"
                        className="mini-icon-btn danger"
                        onClick={() => {
                          const updated = deleteRoutine(settings.activeRoutine.id);
                          onRoutinesChanged(updated);
                          onUpdateSettings({ activeRoutine: null, activeRoutineId: null });
                        }}
                      >
                        🗑 DELETE
                      </button>
                    </>
                  )}
                  <label className="mini-icon-btn" htmlFor="import-routine-json">
                    ⬆️ IMPORT ROUTINE (.JSON)
                  </label>
                  <input
                    id="import-routine-json"
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={handleImportJson}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="subtitle">Clear some room. BodyBeat uses your camera to track your movements on this device.</p>
      {settings.activeRoutine?.guidedMoves && <p className="subtitle">{settings.activeRoutine.name} · {settings.duration}s</p>}
      <div className="podium-actions">
        <button type="button" className="secondary-btn" disabled={!aiReady} onClick={onStartPractice}>
          Practice · 20 seconds
        </button>
        <button className="primary-btn" disabled={!aiReady} onClick={onStart}>
          {!aiReady
            ? "Getting the camera ready…"
            : settings.isRecording
              ? "⏺ START RECORDING"
              : hasReturningPlaylist && isPlaylist
                ? "PLAY AGAIN 💃"
                : "LET'S DANCE! 💃"}
        </button>
      </div>
    </div>
  );
}
