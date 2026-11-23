// frontend/src/components/Diary.jsx
import React, { useState, useEffect, useMemo } from "react";
import { SecureImage } from "./SecureFile";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

const MOODS = [
  { key: "happy", label: "Happy", emoji: "😊" },
  { key: "neutral", label: "Neutral", emoji: "😐" },
  { key: "sad", label: "Sad", emoji: "😔" },
  { key: "anxious", label: "Anxious", emoji: "😰" },
  { key: "angry", label: "Angry", emoji: "😡" },
  { key: "tired", label: "Tired", emoji: "😴" },
];

const CATEGORIES = [
  "Daily Reflection",
  "Stress & Anxiety",
  "Health & Body",
  "Relationships",
  "Career / Studies",
  "Period Day",
  "Gratitude",
];

const CYCLE_PHASES = [
  "Not sure",
  "Menstrual",
  "Follicular",
  "Ovulation",
  "Luteal",
];

export default function Diary() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [mood, setMood] = useState("neutral");
  const [category, setCategory] = useState("Daily Reflection");
  const [cyclePhase, setCyclePhase] = useState("Not sure");
  const [isPrivate, setIsPrivate] = useState(true);
  const [photos, setPhotos] = useState([]); // File[]

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // filters
  const [search, setSearch] = useState("");
  const [filterMood, setFilterMood] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const token = localStorage.getItem("token");

  async function fetchEntries() {
    try {
      const res = await fetch(`${API_BASE}/diary/entries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error("Diary fetch error");
        return;
      }
      const data = await res.json();
      setEntries(data);
    } catch (err) {
      console.error("Diary fetch error", err);
    }
  }

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setTitle("");
    setText("");
    setMood("neutral");
    setCategory("Daily Reflection");
    setCyclePhase("Not sure");
    setIsPrivate(true);
    setEditingId(null);
    setPhotos([]);
  }

  function handlePhotosChange(e) {
    const files = Array.from(e.target.files || []);
    setPhotos(files);
  }

  async function save() {
    if (!text.trim()) return alert("Write something first");
    setLoading(true);

    try {
      if (editingId) {
        // EDIT: text fields only, photos remain as they were
        const body = {
          text,
          title,
          date: new Date().toISOString(),
          mood,
          category,
          cyclePhase,
          private: isPrivate,
        };

        const res = await fetch(`${API_BASE}/diary/entry/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          resetForm();
          fetchEntries();
        } else {
          const err = await res.json();
          alert(err.error || "Error updating diary");
        }
      } else {
        // CREATE: use FormData so we can send photos
        const formData = new FormData();
        formData.append("text", text);
        formData.append("title", title);
        formData.append("date", new Date().toISOString());
        formData.append("mood", mood);
        formData.append("category", category);
        formData.append("cyclePhase", cyclePhase);
        formData.append("private", isPrivate);

        photos.forEach((file) => {
          formData.append("photos", file);
        });

        const res = await fetch(`${API_BASE}/diary/entry`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            // DO NOT set Content-Type, browser sets multipart boundary
          },
          body: formData,
        });

        if (res.ok) {
          resetForm();
          fetchEntries();
        } else {
          const err = await res.json();
          alert(err.error || "Error saving diary");
        }
      }
    } catch (err) {
      console.error("Diary save error", err);
      alert("Error saving diary");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    const sure = window.confirm("Delete this entry? This cannot be undone.");
    if (!sure) return;

    try {
      const res = await fetch(`${API_BASE}/diary/entry/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e._id !== id));
      } else {
        const err = await res.json();
        alert(err.error || "Error deleting entry");
      }
    } catch (err) {
      console.error("Diary delete error", err);
      alert("Error deleting entry");
    }
  }

  function handleEdit(entry) {
    setEditingId(entry._id);
    setTitle(entry.title || "");
    setText(entry.text || "");
    setMood(entry.mood || "neutral");
    setCategory(entry.category || "Daily Reflection");
    setCyclePhase(entry.cyclePhase || "Not sure");
    setIsPrivate(entry.private ?? true);
    setPhotos([]); // editing doesn't change existing photos for now
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchesMood = filterMood ? e.mood === filterMood : true;
      const matchesCategory = filterCategory
        ? e.category === filterCategory
        : true;
      const matchesSearch = search
        ? (e.title && e.title.toLowerCase().includes(search.toLowerCase())) ||
          (e.text && e.text.toLowerCase().includes(search.toLowerCase()))
        : true;
      return matchesMood && matchesCategory && matchesSearch;
    });
  }, [entries, filterMood, filterCategory, search]);

  return (
    <div className="stack-lg">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>Your personal diary</h2>
        <p>
          This is your safe place. You can also save special pictures from your
          day here 💗
        </p>
      </div>

      {/* New / Edit Entry */}
      <div className="card-muted stack">
        {editingId && (
          <span className="badge badge-plum" style={{ alignSelf: "flex-start" }}>
            Editing entry
          </span>
        )}

        {/* Title */}
        <input
          className="input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title for today (optional)…"
          aria-label="Entry title"
        />

        {/* Mood selector */}
        <div className="stack-sm">
          <span className="field-label">Today I feel</span>
          <div className="row-sm" role="group" aria-label="Mood">
            {MOODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMood(m.key)}
                aria-pressed={mood === m.key}
                className={`chip${mood === m.key ? " is-active" : ""}`}
              >
                <span aria-hidden="true">{m.emoji}</span> {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category + Phase + Private */}
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Category</span>
            <select
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Cycle phase</span>
            <select
              className="select"
              value={cyclePhase}
              onChange={(e) => setCyclePhase(e.target.value)}
            >
              {CYCLE_PHASES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          🔒 Extra private
        </label>

        {/* File upload */}
        <div className="field">
          <span className="field-label">Special picture(s) of today</span>
          <input
            className="input"
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotosChange}
            aria-label="Special pictures of today"
          />
          {photos.length > 0 && (
            <div className="row-sm" style={{ marginTop: 4 }}>
              {photos.map((file, idx) => (
                <img
                  key={idx}
                  className="thumb"
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  width={70}
                  height={70}
                />
              ))}
            </div>
          )}
        </div>

        {/* Textarea */}
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          aria-label="Diary entry"
          placeholder="Write about your day, your body, your thoughts, and what these pictures mean to you…"
        />

        {/* Buttons */}
        <div className="row-between">
          <span className="text-xs subtle">{text.length} characters</span>
          <div className="row-sm">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-ghost btn-sm"
              >
                Cancel edit
              </button>
            )}
            <button
              onClick={() => {
                setText("");
                setPhotos([]);
              }}
              type="button"
              className="btn btn-secondary btn-sm"
            >
              Clear
            </button>
            <button
              onClick={save}
              type="button"
              disabled={loading || !text.trim()}
              className="btn btn-primary btn-sm"
            >
              {editingId
                ? loading
                  ? "Updating…"
                  : "Update entry"
                : loading
                ? "Saving…"
                : "Save entry"}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="stack">
        <div className="row-between">
          <h3 className="m-0">Past entries</h3>
          <span className="badge">{filteredEntries.length}</span>
        </div>
        <div className="row-sm">
          <input
            className="input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in your diary…"
            aria-label="Search diary"
            style={{ flex: "1 1 200px", width: "auto" }}
          />
          <select
            className="select"
            value={filterMood}
            onChange={(e) => setFilterMood(e.target.value)}
            aria-label="Filter by mood"
            style={{ width: "auto" }}
          >
            <option value="">All moods</option>
            {MOODS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            aria-label="Filter by category"
            style={{ width: "auto" }}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Entries list */}
        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            No entries yet here. Your story (and your little memories) start
            whenever you are ready 💗
          </div>
        ) : (
          <ul className="list">
            {filteredEntries.map((e) => {
              const moodMeta = MOODS.find((m) => m.key === e.mood);
              return (
                <li key={e._id} className="list-item stack-sm">
                  <div className="row-between">
                    <div className="row-sm text-xs subtle">
                      {moodMeta && (
                        <span title={moodMeta.label} style={{ fontSize: "1.1rem" }}>
                          {moodMeta.emoji}
                        </span>
                      )}
                      <span>{new Date(e.date || e.createdAt).toLocaleString()}</span>
                      {e.category && (
                        <span className="badge badge-accent">{e.category}</span>
                      )}
                      {e.cyclePhase && e.cyclePhase !== "Not sure" && (
                        <span className="badge badge-plum">
                          {e.cyclePhase} phase
                        </span>
                      )}
                      {e.private && <span title="Extra private">🔒</span>}
                    </div>
                    <div className="row-sm">
                      <button
                        type="button"
                        onClick={() => handleEdit(e)}
                        className="btn btn-ghost btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(e._id)}
                        className="btn btn-danger btn-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {e.title && <h3 className="m-0">{e.title}</h3>}

                  {/* Photos gallery */}
                  {e.photos && e.photos.length > 0 && (
                    <div className="row-sm">
                      {e.photos.map((p, idx) => (
                        <SecureImage
                          key={idx}
                          className="thumb"
                          path={p}
                          alt="memory"
                          width={80}
                          height={80}
                        />
                      ))}
                    </div>
                  )}

                  <div className="pre-wrap text-sm muted">{e.text}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
