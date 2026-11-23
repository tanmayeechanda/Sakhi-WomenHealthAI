import React, { useState, useEffect, useCallback } from "react";
// 🆕 Import React Day Picker components and styles
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
// Helper for date comparison (replacing toDateString comparison)
import { isSameDay } from "date-fns";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";


function formatDate(value, short = false) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, short
    ? { day: "numeric", month: "short" }
    : { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function PeriodLogger({ onLogged }) {
  // Cycle stats come from the backend (GET /period/current-phase), which
  // learns the user's own average cycle length from her history.
  const [cycleStats, setCycleStats] = useState(null);
  const [loading, setLoading] = useState(true);
  // loggedDates holds Date objects from the backend
  const [loggedDates, setLoggedDates] = useState([]);

  const fetchHistory = useCallback(async () => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [historyRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/period/history`, { headers }),
        fetch(`${API_BASE}/period/current-phase`, { headers }),
      ]);
      const history = await historyRes.json();
      if (historyRes.ok && Array.isArray(history)) {
        // Every logged day (and every day between a start and end date) is highlighted
        const dates = [];
        for (const entry of history) {
          const start = new Date(entry.startDate);
          const end = entry.endDate ? new Date(entry.endDate) : start;
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
          }
        }
        setLoggedDates(dates);
      }
      if (statsRes.ok) setCycleStats(await statsRes.json());
    } catch (err) {
      console.error("Failed to load history", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  async function logPeriodStart() {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/period/entry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        startDate: new Date().toISOString(),
        flow: "moderate",
      }),
    });

    if (res.ok) {
      alert("Cycle Started! Tracking updated.");
      fetchHistory();
      if (onLogged) onLogged();
    } else {
      alert("Error logging period.");
    }
  }

  async function logPeriodEnd() {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/period/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      alert(data.message || "Period end saved.");
      fetchHistory();
      if (onLogged) onLogged();
    } else {
      alert(data.error || "Error saving period end.");
    }
  }

  // Define the custom class name for logged days
  const modifiersClassNames = {
    logged: "day-picker-logged", // Custom class name
  };

  // Define the modifier function using date-fns
  const modifiers = {
    logged: (date) =>
      loggedDates.some((loggedDate) => isSameDay(loggedDate, date)),
  };

  if (loading)
    return (
      <div className="row muted text-sm">
        <div className="spinner" /> Loading your cycle data...
      </div>
    );

  return (
    <div className="stack-lg">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>Cycle overview</h2>
        <p>Manage your monthly health: log your flow and see what's coming next.</p>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* 1. Info Panel (Cycle Forecast + Inner Season) */}
        <div className="stack">
          {/* Cycle Forecast Card */}
          <div className="stat">
            <div className="row-between">
              <div className="stat-label">Cycle forecast</div>
              <span aria-hidden="true">🔮</span>
            </div>
            <div className="text-sm muted" style={{ marginTop: 6 }}>Next period</div>
            <div className="stat-value" style={{ fontSize: "1.25rem" }}>
              {!cycleStats || cycleStats.phase === "unknown"
                ? "No data yet"
                : cycleStats.isLate
                ? `${cycleStats.daysLate} day${cycleStats.daysLate === 1 ? "" : "s"} late`
                : formatDate(cycleStats.nextPeriodDate)}
            </div>
            <div className="row-sm" style={{ marginTop: 8 }}>
              {!cycleStats || cycleStats.phase === "unknown" ? (
                <span className="badge badge-accent">Log a period first</span>
              ) : cycleStats.isLate ? (
                <span className="badge badge-warning">
                  Expected after a {cycleStats.avgCycleLength}-day cycle
                </span>
              ) : (
                <span className="badge badge-accent">
                  {cycleStats.daysUntilNextPeriod === 0
                    ? "Expected today"
                    : `${cycleStats.daysUntilNextPeriod} days to go`}
                </span>
              )}
            </div>
            {cycleStats && cycleStats.phase !== "unknown" && (
              <div className="text-xs subtle" style={{ marginTop: 8 }}>
                {cycleStats.isPersonalised
                  ? `Based on your average ${cycleStats.avgCycleLength}-day cycle (last ${cycleStats.cyclesUsed} cycle${cycleStats.cyclesUsed === 1 ? "" : "s"}).`
                  : "Assuming a 28-day cycle. Log two or more periods and this becomes personal to you."}
              </div>
            )}
          </div>

          {/* Inner Season Card */}
          <div className="stat">
            <div className="row-between">
              <div className="stat-label">Inner season</div>
              <span aria-hidden="true">🌙</span>
            </div>
            <div className="text-sm muted" style={{ marginTop: 6 }}>
              {cycleStats?.dayOfCycle ? `Day ${cycleStats.dayOfCycle} of your cycle` : "Current status"}
            </div>
            <div className="stat-value" style={{ fontSize: "1.25rem" }}>
              {!cycleStats || cycleStats.phase === "unknown"
                ? "Unknown"
                : `${cycleStats.phaseLabel}${cycleStats.season ? ` (${cycleStats.season})` : ""}`}
            </div>
            {cycleStats?.fertileWindow && !cycleStats.isLate && (
              <span className="badge badge-plum" style={{ marginTop: 8 }}>
                Fertile window: {formatDate(cycleStats.fertileWindow.start, true)} – {formatDate(cycleStats.fertileWindow.end, true)}
              </span>
            )}
          </div>

          {/* Action Button (Logging) */}
          <div className="card-muted stack-sm">
            <h3 className="m-0">Log your flow</h3>
            <div className="row-sm">
              <button onClick={logPeriodStart} className="btn btn-primary grow">
                Start today
              </button>
              <button onClick={logPeriodEnd} className="btn btn-soft grow">
                End today
              </button>
            </div>
          </div>
        </div>

        {/* 2. Calendar Panel */}
        <div className="card-flat period-calendar">
          <h3>Cycle visualizer</h3>

          {/* Inject custom styling for the logged days */}
          <style>{`
            .period-calendar .rdp-root {
              --rdp-accent-color: var(--accent);
              --rdp-accent-background-color: var(--accent-soft);
              --rdp-today-color: var(--accent-ink);
              --rdp-day-height: 40px;
              --rdp-day-width: 40px;
              --rdp-day_button-height: 38px;
              --rdp-day_button-width: 38px;
              font-family: var(--font-body);
              margin: 0 auto;
              max-width: 100%;
              overflow-x: auto;
            }
            .period-calendar .rdp-today .rdp-day_button {
              box-shadow: inset 0 0 0 1.5px var(--accent-ink);
              font-weight: 700;
            }
            .period-calendar .rdp-selected .rdp-day_button {
              background: var(--accent-soft);
              color: var(--accent-ink);
              border-color: var(--accent);
            }
            .period-calendar .day-picker-logged .rdp-day_button,
            .period-calendar .day-picker-logged {
              background-color: var(--accent) !important;
              color: #fff !important;
              border-radius: 50%;
              font-weight: 600;
            }
          `}</style>

          <DayPicker
            mode="single" // Allows selection of one day (for potential future logging)
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            // If you want to disable selecting future dates for logging:
            // disabled={{ after: new Date() }}
          />

          <div className="row-sm text-sm muted" style={{ justifyContent: "center", marginTop: 8 }}>
            <span
              aria-hidden="true"
              style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }}
            />
            Logged period day
          </div>
        </div>
      </div>
    </div>
  );
}
