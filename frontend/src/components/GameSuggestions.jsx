// frontend/src/components/GameSuggestions.jsx
import React, { useEffect, useState } from "react";

// Same convention as the rest of the app: REACT_APP_API_URL includes "/api"
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

const MOOD_FILTERS = [
  { id: "all", label: "All moods" },
  { id: "sad", label: "Sad / low" },
  { id: "anxious", label: "Anxious / worried" },
  { id: "angry", label: "Angry / frustrated" },
  { id: "lonely", label: "Lonely" },
  { id: "tired", label: "Tired / drained" },
  { id: "neutral", label: "Neutral / okay" },
  { id: "calm", label: "Calm / content" },
];

// mood prop optional, same behavior as books
function GameSuggestions({ mood }) {
  const [selectedMood, setSelectedMood] = useState(mood || "all");
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (mood) {
      setSelectedMood(mood);
    }
  }, [mood]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("You must be logged in to view game suggestions.");
      setGames([]);
      return;
    }

    setLoading(true);
    setError("");
    setGames([]);

    const queryMood =
      selectedMood && selectedMood !== "all" ? `?mood=${selectedMood}` : "";

    fetch(`${API_BASE}/resources/games${queryMood}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to fetch games.");
        }
        return res.json();
      })
      .then((data) => {
        setGames(data || []);
      })
      .catch((err) => {
        console.error("Games fetch error:", err);
        setError(err.message || "Could not load game suggestions right now.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedMood, refreshKey]);

  function handleAnotherSet() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="stack">
      <div>
        <h3 className="card-title">Gentle game &amp; activity suggestions 🎮</h3>
        <p className="card-subtitle m-0">
          Some are real online games or apps, some are calm offline activities.
          Pick what matches your energy level.
        </p>
      </div>

      {!mood && (
        <div className="row-sm" role="group" aria-label="Filter by mood">
          {MOOD_FILTERS.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedMood(m.id);
                setRefreshKey(0);
              }}
              className={`chip${selectedMood === m.id ? " is-active" : ""}`}
              aria-pressed={selectedMood === m.id}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="row-sm muted text-sm">
          <div className="spinner" /> Loading game suggestions…
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && games.length === 0 && (
        <div className="empty-state">
          No game suggestions available right now. Try a different mood, or come
          back later.
        </div>
      )}

      {!loading && !error && games.length > 0 && (
        <>
          <div className="grid-auto">
            {games.map((game) => (
              <button
                key={game.id}
                type="button"
                className="tile stack-sm"
                style={{ gap: 4 }}
                onClick={() =>
                  window.open(game.url, "_blank", "noopener,noreferrer")
                }
              >
                <span className="fw-600">{game.title}</span>
                {game.vibe && (
                  <span>
                    <span className="badge badge-success">{game.vibe}</span>
                  </span>
                )}
                <span className="muted text-sm">{game.description}</span>
                <span className="subtle text-xs">
                  Platforms: {game.platforms}
                </span>
                <span className="text-xs fw-600" style={{ color: "var(--accent-ink)", marginTop: 4 }}>
                  Open ↗
                </span>
              </button>
            ))}
          </div>

          <div>
            <button
              onClick={handleAnotherSet}
              disabled={loading}
              className="btn btn-soft"
            >
              Show another set ✨
            </button>
          </div>
        </>
      )}

      <p className="subtle text-xs m-0">
        If anything feels overwhelming or overstimulating, it’s okay to stop and
        rest. This is meant to be gentle, not stressful. 💚
      </p>
    </div>
  );
}

export default GameSuggestions;
