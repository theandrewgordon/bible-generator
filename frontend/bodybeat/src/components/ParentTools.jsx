import { useState } from "react";
import { bodyBeatCsrf } from "../audio/guidedVoice";
import { MOVE_CUES } from "../engine/guidedRoutine";
import { getPlaytestStats } from "../storage/playtestStats";

async function askCoach(payload) {
  const csrf = await bodyBeatCsrf();
  const response = await fetch("/labs/bodybeat/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify(payload)
  });
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("Sign in to Faith Sparks Labs and try again.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Try again in a moment.");
  return data;
}

export function ParentTools({ onUseRoutine }) {
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState(null);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const submit = async (action) => {
    setBusy(action);
    setError("");
    if (action === "routine") setDraft(null);
    else setSummary("");
    try {
      if (action === "routine") {
        const data = await askCoach({ action, description: description.trim() });
        setDraft(data.routine);
      } else {
        const data = await askCoach({ action, counts: getPlaytestStats() });
        setSummary(data.summary);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="bodybeat-parent-tools">
      <label htmlFor="bodybeat-routine">Draft a routine with AI</label>
      <input
        id="bodybeat-routine"
        className="routine-name-input"
        placeholder="One minute, easy, two players, lots of reaching"
        maxLength={280}
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
          setDraft(null);
        }}
        aria-describedby="bodybeat-parent-privacy"
        disabled={Boolean(busy)}
      />
      <small id="bodybeat-parent-privacy">Describe the moves and difficulty. Leave out names and personal details.</small>
      <button type="button" className="toggle-btn" disabled={!description.trim() || Boolean(busy)} onClick={() => submit("routine")}>
        {busy === "routine" ? "Drafting…" : "Draft routine"}
      </button>
      {draft && (
        <div aria-live="polite">
          <strong>{draft.name} · {draft.duration}s · {draft.numPlayers} {draft.numPlayers === 1 ? "player" : "players"}</strong>
          <p>{draft.moves.map((move) => MOVE_CUES[move]?.text).join(" → ")}</p>
          <button type="button" className="toggle-btn" onClick={() => onUseRoutine(draft)}>Use this routine</button>
        </div>
      )}
      <button type="button" className="toggle-btn" disabled={Boolean(busy)} onClick={() => submit("summary")}>
        {busy === "summary" ? "Reviewing…" : "Review anonymous play counts with AI"}
      </button>
      {summary && <p role="status">{summary}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
