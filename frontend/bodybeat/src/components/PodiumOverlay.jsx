export function PodiumOverlay({ results, highScoreInfo, onPlayAgain, onChangeSettings }) {
  const isSolo = results.length === 1;
  const p1 = results[0];
  const p2 = results[1];

  let headline = "ADVENTURE COMPLETE!";
  if (!isSolo && p1 && p2) {
    if (p1.score === p2.score) headline = "AMAZING TEAM TIE!";
    else headline = p1.score > p2.score ? "PLAYER 1 WINS!" : "PLAYER 2 WINS!";
  }

  return (
    <div className="fullscreen-overlay" style={{ zIndex: 25 }}>
      <div className="subtitle">
        {highScoreInfo?.isNewRecord
          ? "🎉 NEW HIGH SCORE! 🎉"
          : `Best Score: ${highScoreInfo?.best || 0}`}
      </div>
      <h1>{headline}</h1>

      <div className="podium-grid">
        {results.map((p, idx) => {
          const isWinner =
            isSolo ||
            p1.score === p2.score ||
            (idx === 0 ? p1.score > p2.score : p2.score > p1.score);
          const stars = p.hits >= 25 ? "⭐⭐⭐" : p.hits >= 10 ? "⭐⭐" : "⭐";

          return (
            <div
              key={p.id}
              className={`podium-card ${isWinner ? "winner" : ""}`}
              style={{ borderColor: isWinner ? "#fde047" : p.accentColor }}
            >
              <div className="crown">{stars}</div>
              <div className="podium-name" style={{ color: p.accentColor }}>
                {isSolo ? "TOTAL SCORE" : p.name}
              </div>
              <div className="podium-score">{p.score}</div>
              <div className="podium-stat">{p.hits} Moves Hit</div>
            </div>
          );
        })}
      </div>

      <div className="podium-actions">
        <button className="primary-btn" onClick={onPlayAgain}>
          PLAY AGAIN
        </button>
        <button className="secondary-btn" onClick={onChangeSettings}>
          NEW ADVENTURE
        </button>
      </div>
    </div>
  );
}
