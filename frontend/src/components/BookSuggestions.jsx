// frontend/src/components/BookSuggestions.jsx
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

// mood prop is optional:
// - if mood passed → fixed mood, no internal filter buttons
// - if no mood → user can pick mood inside this component
function BookSuggestions({ mood }) {
  const [selectedMood, setSelectedMood] = useState(mood || "all");
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0); // used to trigger re-fetch

  useEffect(() => {
    if (mood) {
      setSelectedMood(mood);
    }
  }, [mood]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("You must be logged in to view book suggestions.");
      setBooks([]);
      return;
    }

    setLoading(true);
    setError("");
    setBooks([]);

    const queryMood =
      selectedMood && selectedMood !== "all" ? `?mood=${selectedMood}` : "";

    fetch(`${API_BASE}/resources/books${queryMood}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to fetch books.");
        }
        return res.json();
      })
      .then((data) => {
        setBooks(data || []);
      })
      .catch((err) => {
        console.error("Books fetch error:", err);
        setError(err.message || "Could not load book suggestions right now.");
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
        <h3 className="card-title">Book suggestions 📚</h3>
        <p className="card-subtitle m-0">
          These are online book links or info pages. You can open them in a new
          tab and choose the format you like (ebook, paperback, etc.).
        </p>
      </div>

      {/* Show internal mood filter only if parent didn't fix mood */}
      {!mood && (
        <div className="row-sm" role="group" aria-label="Filter by mood">
          {MOOD_FILTERS.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedMood(m.id);
                setRefreshKey(0); // reset refresh when changing mood
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
          <div className="spinner" /> Loading book suggestions…
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && books.length === 0 && (
        <div className="empty-state">
          No book suggestions available right now. Try a different mood, or come
          back later.
        </div>
      )}

      {!loading && !error && books.length > 0 && (
        <>
          <div className="grid-auto">
            {books.map((book) => (
              <button
                key={book.id}
                type="button"
                className="tile stack-sm"
                style={{ gap: 4 }}
                onClick={() =>
                  window.open(book.url, "_blank", "noopener,noreferrer")
                }
              >
                <span className="fw-600">{book.title}</span>
                <span className="subtle text-sm">by {book.author}</span>
                <span className="muted text-sm">{book.description}</span>
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
        Always choose what feels emotionally safe for you. If a book feels too
        heavy, it’s okay to stop reading. 💜
      </p>
    </div>
  );
}

export default BookSuggestions;
