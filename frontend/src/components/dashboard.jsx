import React, { useState } from "react";
import AIChatVoice from "./AIChatVoice";
import MoodSuggest from "./MoodSuggest";
import PeriodLogger from "./PeriodLogger";
import Diary from "./Diary";
import GameSuggestions from "./GameSuggestions";
import BookSuggestions from "./BookSuggestions";
import WellnessPage from "./WellnessPage";
import {
  MicIcon,
  SparkleIcon,
  DropIcon,
  BookIcon,
  HeartPulseIcon,
  LogoutIcon,
  BrandIcon,
} from "./Icons";

const SECTIONS = [
  { id: "voice", label: "Assistant", Icon: MicIcon },
  { id: "period", label: "Cycle tracker", Icon: DropIcon },
  { id: "diary", label: "Diary", Icon: BookIcon },
  { id: "wellness", label: "Wellness", Icon: HeartPulseIcon },
  { id: "suggestions", label: "For you", Icon: SparkleIcon },
];

const SUGGESTION_TABS = [
  { id: "mood", label: "Mood" },
  { id: "books", label: "Books" },
  { id: "games", label: "Games" },
];

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Dashboard({ user, token, onLogout }) {
  const [activeSection, setActiveSection] = useState("voice"); // main tabs
  const [suggestionTab, setSuggestionTab] = useState("mood"); // 'mood' | 'games' | 'books'

  const displayName =
    user?.name?.trim() || (user?.email ? user.email.split("@")[0] : "there");
  const firstName = displayName.split(" ")[0];
  const initial = displayName.charAt(0) || "?";

  const renderSuggestionsSection = () => (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>Picked for you</h2>
        <p>Small ideas to lift your mood, unwind with a book, or take a playful break.</p>
      </div>
      <div className="segmented" role="tablist" aria-label="Suggestion type">
        {SUGGESTION_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={suggestionTab === t.id}
            className={suggestionTab === t.id ? "is-active" : ""}
            onClick={() => setSuggestionTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {suggestionTab === "mood" && <MoodSuggest />}
        {suggestionTab === "books" && <BookSuggestions token={token} />}
        {suggestionTab === "games" && <GameSuggestions token={token} />}
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "voice":
        return <AIChatVoice />;
      case "suggestions":
        return renderSuggestionsSection();
      case "period":
        return <PeriodLogger />;
      case "diary":
        return <Diary />;
      case "wellness":
        return <WellnessPage token={token} />;
      default:
        return <AIChatVoice />;
    }
  };

  const navItems = SECTIONS.map(({ id, label, Icon }) => (
    <button
      key={id}
      className={`nav-item${activeSection === id ? " is-active" : ""}`}
      aria-current={activeSection === id ? "page" : undefined}
      onClick={() => setActiveSection(id)}
    >
      <Icon />
      {label}
    </button>
  ));

  const brand = (
    <div className="brand">
      <div className="brand-mark">
        <BrandIcon size={18} />
      </div>
      <div>
        <div className="brand-name">Sakhi</div>
        <div className="brand-tag">Your wellness companion</div>
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        {brand}
        <nav className="nav" aria-label="Main">
          <div className="nav-label">Menu</div>
          {navItems}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initial}</div>
            <div className="user-meta">
              <div className="user-name">{displayName}</div>
              {user?.email && <div className="user-email">{user.email}</div>}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start" }} onClick={onLogout}>
            <LogoutIcon size={16} />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="topbar">
        <div className="row-between">
          {brand}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onLogout} aria-label="Log out">
            <LogoutIcon size={16} />
          </button>
        </div>
        <nav className="topbar-nav" aria-label="Main">
          {navItems}
        </nav>
      </header>

      <main className="main">
        <div className="main-inner">
          <div className="greeting">
            <h1>
              {greetingForNow()}, {firstName}
            </h1>
            <p>How are you feeling today? Everything you need is in one calm place.</p>
          </div>
          <section className="card">{renderSection()}</section>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
