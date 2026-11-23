import { THEMES } from "../constants/themes";

export function HudOverlay({
  themeId,
  numPlayers,
  hudPlayers,
  timerDisplay,
  missionProgress,
  isUrgentTime,
  isContinuousDance,
  currentTrackInfo,
  latencyMs,
  onLatencyChange,
  isPlayingScreen,
  isPaused,
  isRecording,
  recordedCount,
  onRecordSpecialCue,
  onSkipSong,
  onFinishEarly,
  onTogglePause,
  onSyncBeatOne,
  onQuitToLobby,
  banner,
  guidedCue,
  practice
}) {
  const theme = THEMES[themeId] || THEMES.volcano;

  return (
    <>
      {guidedCue && !isPaused && (
        <div className="guided-cue">
          <span aria-hidden="true">{guidedCue.icon}</span>
          {guidedCue.next ? "Next: " : ""}{guidedCue.text}
        </div>
      )}
      <div id="hud">
        {/* Player 1 Stars / Points */}
        <div className="player-hud p1">
          <div className="badge p1-badge">
            <span style={{ color: "#00f0ff" }}>
              {isRecording
                ? `⏺ MOVES: ${recordedCount}`
                : isContinuousDance
                  ? `${numPlayers === 2 ? "P1 " : ""}⭐ ${hudPlayers[0].score}`
                  : `${numPlayers === 2 ? "P1" : "SCORE"}: ${hudPlayers[0].score}`}
            </span>
            {!isRecording && hudPlayers[0].combo > 1 && (
              <span className="combo-tag">🔥 {hudPlayers[0].combo}x</span>
            )}
          </div>
        </div>

        {/* Center Progress, Song Indicator, Timer & Pause */}
        <div id="center-hud">
          {isPlayingScreen && !isRecording && (
            <div className="badge mission-bar-badge">
              <span className="mission-label">
                {isContinuousDance
                  ? currentTrackInfo?.playlistTotal > 0
                    ? `🎵 SONG ${currentTrackInfo.playlistIndex + 1} OF ${currentTrackInfo.playlistTotal}`
                    : "🎵 CONTINUOUS DANCE"
                  : practice ? "PRACTICE ROUND" : theme.missionLabel}
              </span>
              <div className="mission-track">
                <div
                  className="mission-fill"
                  style={{ width: `${missionProgress}%` }}
                />
                <span
                  className="mission-runner"
                  style={{ left: `calc(${Math.min(96, missionProgress)}% - 8px)` }}
                >
                  💃
                </span>
              </div>
              <span className="mission-goal">
                {isContinuousDance ? "DANCE PARTY" : theme.missionGoalLabel}
              </span>
            </div>
          )}

          <div className="center-top-row">
            <div className={`badge ${isUrgentTime ? "urgent" : ""}`} id="timer-badge">
              ⏱ {timerDisplay}
            </div>

            {isPlayingScreen && (
              <button
                type="button"
                className="badge interactive-badge hud-action-btn"
                onClick={onTogglePause}
              >
                {isPaused ? "▶️ RESUME" : "⏸ PAUSE"}
              </button>
            )}

            {isPlayingScreen && isContinuousDance && !isRecording && (
              <button
                type="button"
                className="badge interactive-badge hud-action-btn"
                onClick={onFinishEarly}
              >
                🏁 FINISH
              </button>
            )}

            {isPlayingScreen && isRecording && (
              <button
                type="button"
                className="badge interactive-badge hud-action-btn save-rec-btn"
                onClick={onFinishEarly}
              >
                💾 SAVE ROUTINE
              </button>
            )}
          </div>
        </div>

        {/* Player 2 Stars / Points (Only when 2 players active) */}
        {numPlayers === 2 && !isRecording && (
          <div className="player-hud p2">
            <div className="badge p2-badge">
              <span style={{ color: "#ff2a85" }}>
                {isContinuousDance ? `P2 ⭐ ${hudPlayers[1].score}` : `P2: ${hudPlayers[1].score}`}
              </span>
              {hudPlayers[1].combo > 1 && (
                <span className="combo-tag">🔥 {hudPlayers[1].combo}x</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pause Menu & Simple Recovery Actions */}
      {isPlayingScreen && isPaused && (
        <div className="pause-modal-backdrop">
          <div className="setup-card pause-modal-card">
            <h2 style={{ margin: 0, color: "#fde047", letterSpacing: "1px" }}>PAUSED</h2>

            <div className="selector-row">
              <button
                type="button"
                className="toggle-btn active"
                onClick={onTogglePause}
              >
                ▶️ RESUME
              </button>
              {isContinuousDance ? (
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => {
                    onSkipSong?.();
                    onTogglePause();
                  }}
                >
                  ⏭ SKIP SONG
                </button>
              ) : (
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => {
                    onSyncBeatOne();
                    onTogglePause();
                  }}
                >
                  🎯 SYNC BEAT 1
                </button>
              )}
            </div>

            <div className="badge interactive-badge" style={{ justifyContent: "space-between" }}>
              <span>AIRPLAY DELAY</span>
              <input
                type="range"
                id="latency-slider"
                min="0"
                max="400"
                step="10"
                value={latencyMs}
                onChange={(e) => onLatencyChange(Number(e.target.value))}
              />
              <span id="latency-val">{latencyMs} ms</span>
            </div>

            <button
              type="button"
              className="secondary-btn"
              style={{ width: "100%", padding: "12px" }}
              onClick={onQuitToLobby}
            >
              🏠 BACK TO MUSIC
            </button>
          </div>
        </div>
      )}

      {isPlayingScreen && isRecording && (
        <div className="record-cue-bar">
          <button type="button" className="cue-btn" onClick={() => onRecordSpecialCue("LAVA")}>
            🌋 + JUMP
          </button>
          <button type="button" className="cue-btn" onClick={() => onRecordSpecialCue("DUCK")}>
            ⚡ + DUCK
          </button>
          <button type="button" className="cue-btn" onClick={() => onRecordSpecialCue("FREEZE")}>
            ❄️ + FREEZE
          </button>
          <button type="button" className="cue-btn" onClick={() => onRecordSpecialCue("TRACE")}>
            〰️ + TRACE
          </button>
          <button type="button" className="cue-btn" onClick={() => onRecordSpecialCue("GATE")}>
            🙌 + GATE
          </button>
        </div>
      )}

      <div
        id="action-banner"
        className={banner.visible && !isPaused ? "visible" : ""}
        style={{ background: banner.gradient }}
      >
        {banner.text}
      </div>
    </>
  );
}
