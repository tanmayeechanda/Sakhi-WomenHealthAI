// frontend/src/components/MoodSuggest.jsx
import React, { useState } from "react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

const MOOD_OPTIONS = [
  { id: "anxious", label: "Anxious / worried", emoji: "😰" },
  { id: "sad", label: "Sad / low", emoji: "😔" },
  { id: "angry", label: "Angry / frustrated", emoji: "😡" },
  { id: "calm", label: "Calm / content", emoji: "🌿" },
  { id: "neutral", label: "Neutral / okay", emoji: "🙂" },
];

export default function MoodSuggest({ defaultCyclePhase = "period" }) {
  const [mood, setMood] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    if (!mood) return;
    const token = localStorage.getItem("token");

    if (!token) {
      setError("You need to be logged in to get mood suggestions.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/ai/mood-suggestions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mood, cyclePhase: defaultCyclePhase }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error fetching suggestions");
      }
      setResult(data);
    } catch (err) {
      console.error("MoodSuggest error:", err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h3 className="card-title">Quick mood suggestions</h3>
        <p className="card-subtitle m-0">
          Tap a mood and I’ll suggest small actions and food ideas that might
          support you right now.
        </p>
      </div>

      <div className="row-sm" role="group" aria-label="Your mood">
        {MOOD_OPTIONS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMood(m.id)}
            className={`chip${mood === m.id ? " is-active" : ""}`}
            aria-pressed={mood === m.id}
          >
            <span aria-hidden="true">{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div>
        <button
          onClick={ask}
          disabled={!mood || loading}
          className="btn btn-primary"
        >
          {loading ? "Getting suggestions..." : "Get suggestions"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className="stack-sm">
          <div className="grid-2">
            <div className="card-muted">
              <h4 className="m-0" style={{ marginBottom: 6 }}>
                🌱 Gentle actions
              </h4>
              <ul className="text-sm" style={{ paddingLeft: 18, margin: 0 }}>
                {(result.actions || []).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>

            <div className="card-muted">
              <h4 className="m-0" style={{ marginBottom: 6 }}>
                🥗 Food tips
              </h4>
              <ul className="text-sm" style={{ paddingLeft: 18, margin: 0 }}>
                {(result.foods || []).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          </div>

          <p className="subtle text-xs m-0">
            {result.checkin ||
              "If your pain (emotional or physical) feels overwhelming, please consider talking to a trusted doctor or counselor."}
          </p>
        </div>
      )}
    </div>
  );
}
