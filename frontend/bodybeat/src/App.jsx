import { useRef, useState, useCallback, useEffect } from "react";
import { useVolcanoEngine } from "./engine/useVolcanoEngine";
import { HudOverlay } from "./components/HudOverlay";
import { LobbyOverlay } from "./components/LobbyOverlay";
import { PodiumOverlay } from "./components/PodiumOverlay";
import { YouTubePlayer } from "./components/YouTubePlayer";
import { parseYouTubeInput } from "./utils/youtubeUrl";
import { loadSavedRoutines } from "./storage/routineStorage";
import "./styles.css";

const PREFS_KEY = "bodybeat_saved_prefs_v2";

function loadSavedPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytReadyRef = useRef(false);

  const [savedRoutines, setSavedRoutines] = useState(() => loadSavedRoutines());

  const [settings, setSettings] = useState(() => {
    const prefs = loadSavedPrefs();
    const savedYtUrl = prefs.lastYouTubeUrl || "";
    const parsedYt = savedYtUrl ? parseYouTubeInput(savedYtUrl) : null;
    return {
      themeId: prefs.themeId || "worship",
      numPlayers: prefs.numPlayers || 1,
      gameMode: prefs.gameMode || "auto",
      difficulty: prefs.difficulty || "normal",
      duration: prefs.duration || 90,
      bpm: prefs.bpm || 118,
      firstBeatSeconds: 0,
      syncConfidence: 100,
      hasPhaseLock: !parsedYt,
      hasTempoEstimate: !parsedYt,
      isAnalyzingAudio: false,
      phraseIntensity: null,
      trackId: prefs.trackId || "joyful-praise",
      ytLoadState: parsedYt ? "loading" : "idle",
      audioSource: parsedYt ? "youtube" : "synth",
      youtubeUrl: savedYtUrl,
      youtubeSource: parsedYt,
      activeRoutine: null,
      activeRoutineId: null,
      isRecording: false,
      routineName: "",
      voiceCoach: prefs.voiceCoach !== undefined ? prefs.voiceCoach : false
    };
  });

  const [hasReturningPlaylist, setHasReturningPlaylist] = useState(() => {
    const prefs = loadSavedPrefs();
    return Boolean(prefs.lastYouTubeUrl && parseYouTubeInput(prefs.lastYouTubeUrl)?.type === "playlist");
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          themeId: settings.themeId,
          numPlayers: settings.numPlayers,
          gameMode: settings.gameMode,
          difficulty: settings.difficulty,
          duration: settings.duration,
          bpm: settings.bpm,
          trackId: settings.trackId,
          voiceCoach: settings.voiceCoach,
          lastYouTubeUrl: settings.youtubeSource ? settings.youtubeUrl : ""
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [
    settings.themeId,
    settings.numPlayers,
    settings.gameMode,
    settings.difficulty,
    settings.duration,
    settings.bpm,
    settings.trackId,
    settings.voiceCoach,
    settings.youtubeUrl,
    settings.youtubeSource
  ]);

  const [latencyMs, setLatencyMs] = useState(() =>
    Number(localStorage.getItem("bodybeat_latency_ms") || 0)
  );

  const handleLatencyChange = (ms) => {
    setLatencyMs(ms);
    localStorage.setItem("bodybeat_latency_ms", String(ms));
  };

  const updateSettings = useCallback((patch) => {
    if (patch.youtubeSource !== undefined) {
      ytReadyRef.current = false;
    }
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleFallbackToBuiltinMusic = useCallback(() => {
    ytReadyRef.current = false;
    setSettings((prev) => ({
      ...prev,
      audioSource: "synth",
      trackId: "joyful-praise",
      bpm: 118,
      youtubeSource: null,
      hasPhaseLock: true,
      hasTempoEstimate: true,
      syncConfidence: 100
    }));
  }, []);

  const handleBpmDetected = useCallback((payload) => {
    if (typeof payload === "number") {
      setSettings((prev) => ({
        ...prev,
        bpm: payload,
        hasTempoEstimate: true,
        hasPhaseLock: false
      }));
      return;
    }
    setSettings((prev) => ({
      ...prev,
      bpm: payload.bpm,
      ...(payload.firstBeatSeconds !== undefined ? { firstBeatSeconds: payload.firstBeatSeconds } : {}),
      syncConfidence: payload.confidence ?? prev.syncConfidence,
      hasTempoEstimate: true,
      hasPhaseLock: Boolean(payload.hasPhaseLock)
    }));
  }, []);

  const handleRoutineSaved = useCallback((updatedList, newRoutine) => {
    setSavedRoutines(updatedList);
    setSettings((prev) => ({
      ...prev,
      isRecording: false,
      activeRoutine: newRoutine,
      activeRoutineId: newRoutine.id,
      hasPhaseLock: true,
      hasTempoEstimate: true
    }));
  }, []);

  const {
    aiReady,
    cameraPreview,
    framingStatus,
    resolvedBodyMode,
    effectivePlayersCount,
    currentTrackInfo,
    recoveryError,
    clearRecoveryError,
    retryVision,
    recoverWithBuiltinMusic,
    enableCameraPreview,
    screen,
    setScreen,
    countdownNumber,
    isPaused,
    banner,
    timerDisplay,
    missionProgress,
    isUrgentTime,
    hudPlayers,
    podiumResults,
    highScoreInfo,
    recordedCount,
    recordSpecialCue,
    micLearning,
    micMode,
    micLevel,
    beatFlash,
    startAudioLearner,
    stopAudioLearner,
    startGame,
    beginRound,
    pauseGame,
    resumeGame,
    handleYouTubePlaying,
    handleYouTubePaused,
    handleYouTubeTrackChanged,
    skipPlaylistSong,
    syncBeatOne,
    finishRound,
    quitToLobby,
    loadCustomAudio,
    clearCustomAudio
  } = useVolcanoEngine({
    videoRef,
    canvasRef,
    ytPlayerRef,
    ytReadyRef,
    settings,
    latencyMs,
    onBpmDetected: handleBpmDetected,
    onRoutineSaved: handleRoutineSaved,
    onFallbackToBuiltinMusic: handleFallbackToBuiltinMusic
  });

  const isContinuousDance = settings.youtubeSource?.type === "playlist";

  return (
    <div id="game-container">
      <video ref={videoRef} autoPlay playsInline />
      <canvas ref={canvasRef} />

      {settings.audioSource === "youtube" && settings.youtubeSource && (
        <YouTubePlayer
          youtubeSource={settings.youtubeSource}
          isPlayingScreen={screen === "playing"}
          playerInstanceRef={ytPlayerRef}
          onPlayerLoading={() => {
            ytReadyRef.current = false;
            setSettings((prev) => ({ ...prev, ytLoadState: "loading" }));
          }}
          onPlayerReady={() => {
            ytReadyRef.current = true;
            clearRecoveryError();
          }}
          onPlayerCued={() => {
            ytReadyRef.current = true;
            setSettings((prev) => ({ ...prev, ytLoadState: "cued" }));
          }}
          onAutoplayBlocked={() => {
            setSettings((prev) => ({ ...prev, ytLoadState: "cued" }));
          }}
          onTrackChanged={(meta) => {
            handleYouTubeTrackChanged(meta);
            if (settings.youtubeSource?.type === "playlist") {
              setHasReturningPlaylist(true);
            }
          }}
          onPlayerError={(errInfo) => {
            ytReadyRef.current = false;
            const code = typeof errInfo === "object" ? errInfo?.code : errInfo;
            const reason = typeof errInfo === "object" ? errInfo?.reason : `Error ${code}`;
            setSettings((prev) => ({
              ...prev,
              ytLoadState: "error",
              ytErrorDetail: reason
            }));
            if (screen !== "lobby") {
              setRecoveryError({
                title: isContinuousDance ? "Couldn't play this playlist." : "Having trouble playing this song.",
                message: `${reason}. Try another song or use Built-In Music!`
              });
              quitToLobby();
            }
          }}
          onPlaylistEnded={finishRound}
          onVideoEnded={finishRound}
          onVideoPaused={handleYouTubePaused}
          onVideoPlaying={() => {
            setSettings((prev) => ({ ...prev, ytLoadState: "playing" }));
            handleYouTubePlaying();
          }}
        />
      )}

      {screen === "playing" && (
        <HudOverlay
          themeId={settings.themeId}
          numPlayers={effectivePlayersCount}
          hudPlayers={hudPlayers}
          timerDisplay={timerDisplay}
          missionProgress={missionProgress}
          isUrgentTime={isUrgentTime}
          isContinuousDance={isContinuousDance}
          currentTrackInfo={currentTrackInfo}
          latencyMs={latencyMs}
          onLatencyChange={handleLatencyChange}
          isPlayingScreen={screen === "playing"}
          isPaused={isPaused}
          isRecording={settings.isRecording}
          recordedCount={recordedCount}
          onRecordSpecialCue={recordSpecialCue}
          onSkipSong={skipPlaylistSong}
          onFinishEarly={finishRound}
          onTogglePause={isPaused ? resumeGame : pauseGame}
          onSyncBeatOne={syncBeatOne}
          onQuitToLobby={quitToLobby}
          banner={banner}
        />
      )}

      {screen === "preparing_media" && (
        <div className="pause-modal-backdrop" style={{ zIndex: 28 }}>
          <div className="setup-card pause-modal-card">
            <h3 style={{ margin: 0, color: "#fde047" }}>Music needs a tap to start.</h3>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#e2e8f0", lineHeight: 1.4 }}>
              Press <strong>PLAY MUSIC</strong> below to start the playlist!
            </p>
            <div className="selector-row">
              <button
                type="button"
                className="toggle-btn active"
                onClick={() => {
                  try {
                    ytPlayerRef.current?.playVideo?.();
                  } catch {
                    // Ignore
                  }
                }}
              >
                ▶️ PLAY MUSIC
              </button>
              <button
                type="button"
                className="toggle-btn"
                onClick={recoverWithBuiltinMusic}
              >
                🎵 PLAY BUILT-IN MUSIC
              </button>
            </div>
            <button
              type="button"
              className="text-link-btn"
              onClick={quitToLobby}
            >
              CHOOSE MUSIC
            </button>
          </div>
        </div>
      )}

      {screen === "countdown" && countdownNumber !== null && (
        <div className="countdown-overlay">
          <div className="countdown-num">{countdownNumber}</div>
          <div className="countdown-sub">GET READY TO DANCE!</div>
        </div>
      )}

      {screen === "lobby" && (
        <LobbyOverlay
          aiReady={aiReady}
          cameraPreview={cameraPreview}
          framingStatus={framingStatus}
          resolvedBodyMode={resolvedBodyMode}
          onEnableCameraPreview={enableCameraPreview}
          settings={settings}
          onUpdateSettings={updateSettings}
          savedRoutines={savedRoutines}
          onRoutinesChanged={setSavedRoutines}
          onAudioFileSelected={loadCustomAudio}
          onClearCustomAudio={clearCustomAudio}
          micLearning={micLearning}
          micMode={micMode}
          micLevel={micLevel}
          beatFlash={beatFlash}
          onStartAudioLearner={startAudioLearner}
          onStopAudioLearner={stopAudioLearner}
          hasReturningPlaylist={hasReturningPlaylist}
          onStart={startGame}
        />
      )}

      {screen === "podium" && (
        <PodiumOverlay
          results={podiumResults}
          highScoreInfo={highScoreInfo}
          onPlayAgain={() => beginRound()}
          onChangeSettings={() => setScreen("lobby")}
        />
      )}

      {recoveryError && (
        <div className="pause-modal-backdrop" style={{ zIndex: 40 }}>
          <div className="setup-card pause-modal-card">
            <h3 style={{ margin: 0, color: "#fde047" }}>{recoveryError.title}</h3>
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#e2e8f0", lineHeight: 1.4 }}>
              {recoveryError.message}
            </p>
            <div className="selector-row">
              {recoveryError.kind ? (
                <button
                  type="button"
                  className="toggle-btn active"
                  onClick={recoveryError.kind === "vision" ? retryVision : clearRecoveryError}
                >
                  {recoveryError.kind === "vision" ? "Try again" : "Back to setup"}
                </button>
              ) : (
                <>
                  <button type="button" className="toggle-btn active" onClick={recoverWithBuiltinMusic}>
                    🎵 PLAY BUILT-IN MUSIC
                  </button>
                  <button type="button" className="toggle-btn" onClick={clearRecoveryError}>
                    CHOOSE MUSIC
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
