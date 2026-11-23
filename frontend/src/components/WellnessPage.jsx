// frontend/src/components/WellnessPage.jsx
import React, { useState, useEffect, useCallback } from "react";

import { SecureFileButton } from "./SecureFile";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

function WellnessPage({ token }) {
  const [reports, setReports] = useState([]);
  const [reportForm, setReportForm] = useState({
    title: "",
    date: "",
    doctorName: "",
    hospital: "",
    notes: "",
  });
  const [reportFile, setReportFile] = useState(null);

  const [aiFile, setAiFile] = useState(null);
  const [reportExplanation, setReportExplanation] = useState("");
  const [reportFindings, setReportFindings] = useState([]);
  const [reportNotice, setReportNotice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const [doctorIssue, setDoctorIssue] = useState("");
  const [doctorCity, setDoctorCity] = useState("");
  const [doctorSuggestion, setDoctorSuggestion] = useState(null);
  const [doctorLoading, setDoctorLoading] = useState(false);

  const [remedySymptom, setRemedySymptom] = useState("");
  const [remedyPhase, setRemedyPhase] = useState("period");
  const [remedyResult, setRemedyResult] = useState(null);
  const [remedyLoading, setRemedyLoading] = useState(false);

  const [apptForm, setApptForm] = useState({
    doctorName: "",
    specialty: "",
    location: "",
    dateTime: "",
  });
  const [nextAppt, setNextAppt] = useState(null);
  const [apptLoading, setApptLoading] = useState(false);

  const [loadingReports, setLoadingReports] = useState(false);

  // report filters
  const [reportSearch, setReportSearch] = useState("");
  const [reportDoctorFilter, setReportDoctorFilter] = useState("");

  // symptom log state
  const [symptomForm, setSymptomForm] = useState({
    symptom: "",
    severity: 3,
    notes: "",
  });
  const [symptoms, setSymptoms] = useState([]);
  const [symptomLoading, setSymptomLoading] = useState(false);

  // current phase from period tracker
  const [currentPhaseInfo, setCurrentPhaseInfo] = useState(null);
  const [phaseLoading, setPhaseLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingReports(true);
      const res = await fetch(`${API_BASE}/medical/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setReports(data);
    } finally {
      setLoadingReports(false);
    }
  }, [token]);

  const fetchNextAppt = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/appointments/next`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setNextAppt(data);
  }, [token]);

  const fetchCurrentPhase = useCallback(async () => {
    if (!token) return;
    try {
      setPhaseLoading(true);
      const res = await fetch(`${API_BASE}/period/current-phase`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCurrentPhaseInfo(data);
      if (data.phase && data.phase !== "unknown") {
        setRemedyPhase(data.phase);
      }
    } finally {
      setPhaseLoading(false);
    }
  }, [token]);

  const fetchSymptoms = useCallback(async () => {
    if (!token) return;
    try {
      setSymptomLoading(true);
      const res = await fetch(`${API_BASE}/symptoms/entries?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSymptoms(data);
    } finally {
      setSymptomLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchReports();
    fetchNextAppt();
    fetchCurrentPhase();
    fetchSymptoms();
  }, [token, fetchReports, fetchNextAppt, fetchCurrentPhase, fetchSymptoms]);

  // ---------- REPORT UPLOAD ----------
  async function handleReportSubmit(e) {
    e.preventDefault();
    if (!reportFile) {
      alert("Please upload a report file.");
      return;
    }

    const formData = new FormData();
    formData.append("title", reportForm.title);
    formData.append("date", reportForm.date);
    formData.append("doctorName", reportForm.doctorName);
    formData.append("hospital", reportForm.hospital);
    formData.append("notes", reportForm.notes);
    formData.append("file", reportFile);

    const res = await fetch(`${API_BASE}/medical/report`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Error saving report");
      return;
    }

    setReportForm({
      title: "",
      date: "",
      doctorName: "",
      hospital: "",
      notes: "",
    });
    setReportFile(null);
    fetchReports();
  }

  // ---------- AI EXPLAIN ----------
  async function handleExplainReport() {
    if (!aiFile) {
      alert("Please upload a report file for AI to explain.");
      return;
    }

    const formData = new FormData();
    formData.append("file", aiFile);

    try {
      setAiLoading(true);
      setReportExplanation("");
      setReportFindings([]);
      setReportNotice("");
      const res = await fetch(`${API_BASE}/ai/report-explain-file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Error explaining report");
        return;
      }
      setReportExplanation(data.explanation || "");
      setReportFindings(Array.isArray(data.findings) ? data.findings : []);
      setReportNotice(data.safeNotice || "");
    } catch (err) {
      alert("Couldn't reach the server. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  // ---------- DOCTOR SUGGEST ----------
  async function handleDoctorSuggest() {
    try {
      setDoctorLoading(true);
      setDoctorSuggestion(null);

      const res = await fetch(`${API_BASE}/ai/doctor-suggest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mainIssue: doctorIssue, city: doctorCity }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Error suggesting doctor");
        return;
      }
      setDoctorSuggestion(data);
    } finally {
      setDoctorLoading(false);
    }
  }

  // ---------- REMEDY SUGGEST ----------
  async function handleRemedySuggest() {
    try {
      setRemedyLoading(true);
      setRemedyResult(null);

      const res = await fetch(`${API_BASE}/ai/remedy-suggest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          symptom: remedySymptom,
          cyclePhase: remedyPhase,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Error fetching comfort tips");
        return;
      }
      setRemedyResult(data);
    } finally {
      setRemedyLoading(false);
    }
  }

  // ---------- APPOINTMENT SUBMIT ----------
  async function handleApptSubmit(e) {
    e.preventDefault();
    try {
      setApptLoading(true);
      const res = await fetch(`${API_BASE}/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(apptForm),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Error saving appointment");
        return;
      }
      setApptForm({
        doctorName: "",
        specialty: "",
        location: "",
        dateTime: "",
      });
      fetchNextAppt();
      alert("Appointment saved! I’ll help you remember it 😊");
    } finally {
      setApptLoading(false);
    }
  }

  // ---------- SYMPTOM LOG ----------
  async function handleSymptomSubmit(e) {
    e.preventDefault();
    if (!symptomForm.symptom.trim()) {
      alert("Please describe the symptom.");
      return;
    }

    try {
      setSymptomLoading(true);
      const res = await fetch(`${API_BASE}/symptoms/entry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...symptomForm,
          cyclePhase: currentPhaseInfo?.phase || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Error logging symptom");
        return;
      }

      setSymptomForm({ symptom: "", severity: 3, notes: "" });
      fetchSymptoms();
    } finally {
      setSymptomLoading(false);
    }
  }

  // ---------- FILTER REPORTS ----------
  const filteredReports = reports.filter((r) => {
    const matchesDoctor = reportDoctorFilter
      ? r.doctorName?.toLowerCase() === reportDoctorFilter.toLowerCase()
      : true;

    const matchesSearch = reportSearch
      ? (r.title &&
          r.title.toLowerCase().includes(reportSearch.toLowerCase())) ||
        (r.notes && r.notes.toLowerCase().includes(reportSearch.toLowerCase()))
      : true;

    return matchesDoctor && matchesSearch;
  });

  const totalReports = reports.length;

  return (
    <div className="stack-lg">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>Personal wellness</h2>
        <p>
          Your reports, symptoms, appointments and gentle guidance, all in one
          organised place.
        </p>
      </div>

      {/* 0. Wellness snapshot */}
      <section className="stack-sm">
        <div className="eyebrow">Today’s wellness snapshot</div>
        <div className="grid-auto">
          <div className="stat">
            <div className="stat-label">Next appointment</div>
            <div className="text-sm" style={{ marginTop: 6 }}>
              {nextAppt ? (
                <>
                  <span className="fw-600">
                    {nextAppt.doctorName || "Your doctor"}
                  </span>{" "}
                  on {new Date(nextAppt.dateTime).toLocaleString()}{" "}
                  {nextAppt.specialty && (
                    <span className="muted">({nextAppt.specialty})</span>
                  )}
                </>
              ) : (
                <span className="muted">
                  You haven’t added a next appointment yet.
                </span>
              )}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Saved reports</div>
            <div className="stat-value">{totalReports}</div>
            <div className="text-xs subtle">
              {totalReports === 0
                ? "No reports saved yet."
                : totalReports === 1
                ? "1 report"
                : `${totalReports} reports`}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Cycle phase (approx)</div>
            {phaseLoading ? (
              <div className="text-sm muted" style={{ marginTop: 6 }}>
                Checking your logs…
              </div>
            ) : currentPhaseInfo?.phase &&
              currentPhaseInfo.phase !== "unknown" ? (
              <div
                className="stat-value"
                style={{ textTransform: "capitalize" }}
              >
                {currentPhaseInfo.phaseLabel || `${currentPhaseInfo.phase} phase`}
                {currentPhaseInfo.dayOfCycle && (
                  <div className="text-xs subtle" style={{ textTransform: "none", fontFamily: "var(--font-body)", fontWeight: 400 }}>
                    Day {currentPhaseInfo.dayOfCycle} of your cycle
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm muted" style={{ marginTop: 6 }}>
                Not sure yet – you can log your periods in the Period Tracker.
              </div>
            )}
          </div>
        </div>
        <p className="text-xs subtle m-0">
          This space is here to help you feel organised and supported. It
          doesn’t replace a real doctor, but it can remind you that you’re
          taking care of yourself 💗
        </p>
      </section>

      {/* 1. Medical reports */}
      <section className="card-muted stack">
        <div>
          <h3 className="card-title">Medical reports</h3>
          <p className="card-subtitle m-0">
            Keep your important reports in one place. You can store what it was
            about, which doctor you met, and any notes you want to remember.
          </p>
        </div>

        <form onSubmit={handleReportSubmit} className="stack">
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Report title</span>
              <input
                className="input"
                type="text"
                placeholder="Report title (e.g. Blood Test – Jan 2025)"
                value={reportForm.title}
                onChange={(e) =>
                  setReportForm({ ...reportForm, title: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Date</span>
              <input
                className="input"
                type="date"
                value={reportForm.date}
                onChange={(e) =>
                  setReportForm({ ...reportForm, date: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Doctor</span>
              <input
                className="input"
                type="text"
                placeholder="Doctor name"
                value={reportForm.doctorName}
                onChange={(e) =>
                  setReportForm({ ...reportForm, doctorName: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Hospital / clinic</span>
              <input
                className="input"
                type="text"
                placeholder="Hospital / clinic"
                value={reportForm.hospital}
                onChange={(e) =>
                  setReportForm({ ...reportForm, hospital: e.target.value })
                }
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">
              Notes <span className="subtle">(optional)</span>
            </span>
            <textarea
              className="textarea"
              rows={3}
              placeholder="Notes / what the doctor explained (optional)"
              value={reportForm.notes}
              onChange={(e) =>
                setReportForm({ ...reportForm, notes: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span className="field-label">Report file</span>
            <input
              className="input"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => setReportFile(e.target.files[0] || null)}
            />
          </label>
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!reportForm.title || !reportForm.date || !reportFile}
            >
              Save report
            </button>
          </div>
        </form>

        <hr className="divider" style={{ margin: 0 }} />

        <div className="stack-sm">
          <h4 className="m-0">Saved reports</h4>

          {/* Reports filter */}
          <div className="row-sm">
            <input
              className="input"
              type="text"
              placeholder="Search in reports (title / notes)…"
              aria-label="Search reports"
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              style={{ flex: "1 1 200px", width: "auto" }}
            />
            <input
              className="input"
              type="text"
              placeholder="Filter by doctor name"
              aria-label="Filter by doctor name"
              value={reportDoctorFilter}
              onChange={(e) => setReportDoctorFilter(e.target.value)}
              style={{ flex: "0 1 200px", width: "auto" }}
            />
          </div>

          {loadingReports && (
            <p className="text-sm muted m-0">Loading reports…</p>
          )}
          {!loadingReports && filteredReports.length === 0 && (
            <div className="empty-state">
              No reports match these filters yet.
            </div>
          )}
          {filteredReports.length > 0 && (
            <ul className="list">
              {filteredReports.map((r) => (
                <li key={r._id} className="list-item">
                  <div
                    className="row-between"
                    style={{ alignItems: "flex-start" }}
                  >
                    <div className="grow">
                      <div className="fw-600">{r.title}</div>
                      <div className="text-xs subtle">
                        {r.date && new Date(r.date).toLocaleDateString()}{" "}
                        {r.doctorName && `· Dr. ${r.doctorName}`}
                      </div>
                      {r.hospital && (
                        <div className="text-xs subtle">{r.hospital}</div>
                      )}
                    </div>
                    {r.filePath && (
                      <SecureFileButton
                        path={r.filePath}
                        className="btn btn-soft btn-sm"
                      >
                        View report file
                      </SecureFileButton>
                    )}
                  </div>
                  {r.notes && (
                    <div className="text-sm muted" style={{ marginTop: 6 }}>
                      {r.notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* 2. Report reader (free, runs on our server) */}
        <section className="card-muted stack-sm">
          <div>
            <div className="row-sm" style={{ marginBottom: 4 }}>
              <h3 className="card-title m-0">Understand your report</h3>
              <span className="badge badge-plum">Report reader</span>
            </div>
            <p className="card-subtitle m-0">
              Upload a lab report as a PDF or a clear photo. I&apos;ll read the
              values (haemoglobin, thyroid, vitamin D, iron, sugar and more) and
              flag anything outside the usual range. It{" "}
              <strong>cannot diagnose or replace your doctor</strong>. The file
              is deleted right after it&apos;s read.
            </p>
          </div>

          <input
            className="input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            aria-label="Report file to read"
            onChange={(e) => setAiFile(e.target.files[0] || null)}
          />

          <div>
            <button
              className="btn btn-primary"
              onClick={handleExplainReport}
              disabled={!aiFile || aiLoading}
            >
              {aiLoading ? "Reading your report…" : "Read my report"}
            </button>
          </div>

          {reportFindings.length > 0 ? (
            <div className="stack-sm">
              <div className="text-sm muted">
                {reportExplanation.split("\n")[0]}
              </div>
              <ul className="list">
                {reportFindings.map((f) => (
                  <li key={f.key} className="list-item stack-sm" style={{ gap: 4 }}>
                    <div className="row-between">
                      <span className="fw-600">{f.name}</span>
                      <span
                        className={`badge ${
                          f.status === "normal"
                            ? "badge-success"
                            : f.status === "high"
                            ? "badge-danger"
                            : "badge-warning"
                        }`}
                      >
                        {f.status === "normal" ? "Within range" : f.status === "high" ? "High" : "Low"}
                      </span>
                    </div>
                    <div className="text-sm">
                      <strong>
                        {f.value.toLocaleString("en-IN")} {f.unit}
                      </strong>{" "}
                      <span className="subtle">
                        · usual {f.range}
                        {f.rangeSource === "report" ? " (from your report)" : ""}
                      </span>
                    </div>
                    {f.note && <div className="text-sm muted">{f.note}</div>}
                    {f.phaseDependent && f.status !== "normal" && (
                      <div className="text-xs subtle">This hormone depends on your cycle day.</div>
                    )}
                  </li>
                ))}
              </ul>
              {reportNotice && <div className="alert alert-info text-sm">{reportNotice}</div>}
            </div>
          ) : (
            reportExplanation && (
              <div className="card-flat text-sm pre-wrap">{reportExplanation}</div>
            )
          )}
        </section>

        {/* 3. Doctor suggestions */}
        <section className="card-muted stack-sm">
          <div>
            <h3 className="card-title">Find the right type of doctor</h3>
            <p className="card-subtitle m-0">
              Tell me what you’re mainly struggling with, and I’ll suggest{" "}
              <strong>which kind of specialist</strong> might be suitable to
              talk to. If you add your city, I’ll also give you quick search
              links to find top-rated doctors near you.
            </p>
          </div>
          <label className="field">
            <span className="field-label">Main issue</span>
            <input
              className="input"
              type="text"
              placeholder="Main issue (e.g. heavy periods, PCOS, anxiety, hair fall, fever)"
              value={doctorIssue}
              onChange={(e) => setDoctorIssue(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">City</span>
            <input
              className="input"
              type="text"
              placeholder="Your city (e.g. Hyderabad, Noida)"
              value={doctorCity}
              onChange={(e) => setDoctorCity(e.target.value)}
            />
          </label>
          <div>
            <button
              className="btn btn-primary"
              onClick={handleDoctorSuggest}
              disabled={!doctorIssue.trim() || doctorLoading}
            >
              {doctorLoading
                ? "Thinking…"
                : "Suggest doctor type & search links"}
            </button>
          </div>

          {doctorSuggestion && (
            <div className="card-flat stack-sm text-sm">
              <div className="row-sm">
                <span className="fw-600">Suggested specialty:</span>
                <span className="badge badge-accent">
                  {doctorSuggestion.specialty}
                </span>
              </div>
              <p className="m-0">{doctorSuggestion.message}</p>

              {doctorSuggestion.searchLinks && (
                <div className="stack-sm">
                  <div className="fw-600 text-sm">
                    Where you can search for top-rated doctors:
                  </div>
                  <div className="row-sm">
                    {doctorSuggestion.searchLinks.googleSearchUrl && (
                      <a
                        href={doctorSuggestion.searchLinks.googleSearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        Google Search
                      </a>
                    )}
                    {doctorSuggestion.searchLinks.googleMapsUrl && (
                      <a
                        href={doctorSuggestion.searchLinks.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        Google Maps
                      </a>
                    )}
                    {doctorSuggestion.searchLinks.practoSearchUrl && (
                      <a
                        href={doctorSuggestion.searchLinks.practoSearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        Practo
                      </a>
                    )}
                  </div>
                  {doctorSuggestion.note && (
                    <p className="text-xs subtle m-0">
                      {doctorSuggestion.note}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 4. Comfort suggestions (non-medical), auto phase */}
      <section className="card-muted stack-sm">
        <div>
          <div className="row-sm" style={{ marginBottom: 4 }}>
            <h3 className="card-title m-0">Comfort suggestions</h3>
            <span className="badge badge-warning">Not a cure</span>
          </div>
          <p className="card-subtitle m-0">
            These are gentle ideas to make you a bit more comfortable (like
            rest, warmth, hydration). They are <strong>not treatment</strong> –
            always follow medical advice.
          </p>
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">Symptom</span>
            <input
              className="input"
              type="text"
              placeholder="Symptom (e.g. cramps, bloating, low mood, fatigue)"
              value={remedySymptom}
              onChange={(e) => setRemedySymptom(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Cycle phase</span>
            <select
              className="select"
              value={remedyPhase}
              onChange={(e) => setRemedyPhase(e.target.value)}
            >
              <option value="period">On period</option>
              <option value="follicular">Follicular phase</option>
              <option value="ovulation">Ovulation</option>
              <option value="luteal">Luteal (PMS)</option>
            </select>
            <span className="field-hint">
              Auto-picked from your period logs, but you can change it.
            </span>
          </label>
        </div>
        <div>
          <button
            className="btn btn-primary"
            onClick={handleRemedySuggest}
            disabled={!remedySymptom.trim() || remedyLoading}
          >
            {remedyLoading ? "Gathering tips…" : "Get comfort tips"}
          </button>
        </div>
        {remedyResult && (
          <div className="card-flat stack-sm text-sm">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {remedyResult.tips?.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            {remedyResult.warning && (
              <div className="alert alert-warning">{remedyResult.warning}</div>
            )}
          </div>
        )}
      </section>

      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* 5. Symptom log section */}
        <section className="card-muted stack">
          <div>
            <h3 className="card-title">Symptom log</h3>
            <p className="card-subtitle m-0">
              A small place to track things like cramps, headaches, mood
              changes, etc. This stays here so you can remember what you’ve
              been feeling over days or weeks.
            </p>
          </div>

          <form onSubmit={handleSymptomSubmit} className="stack-sm">
            <label className="field">
              <span className="field-label">Symptom</span>
              <input
                className="input"
                type="text"
                placeholder="Symptom (e.g. cramps, headache, low energy)"
                value={symptomForm.symptom}
                onChange={(e) =>
                  setSymptomForm({ ...symptomForm, symptom: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="row-between">
                <span className="field-label">
                  Severity (1 = very mild, 5 = very strong)
                </span>
                <span className="badge badge-accent">
                  Current: {symptomForm.severity}/5
                </span>
              </span>
              <input
                type="range"
                min={1}
                max={5}
                value={symptomForm.severity}
                onChange={(e) =>
                  setSymptomForm({
                    ...symptomForm,
                    severity: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Notes</span>
              <textarea
                className="textarea"
                rows={2}
                style={{ minHeight: 70 }}
                placeholder="Extra notes (e.g. when it started, what helped, any triggers)"
                value={symptomForm.notes}
                onChange={(e) =>
                  setSymptomForm({ ...symptomForm, notes: e.target.value })
                }
              />
            </label>
            <div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={symptomLoading}
              >
                {symptomLoading ? "Saving…" : "Save symptom"}
              </button>
            </div>
          </form>

          <div className="stack-sm">
            <h4 className="m-0">Recent symptoms</h4>
            {symptomLoading && symptoms.length === 0 && (
              <p className="text-sm muted m-0">
                Loading your symptom history…
              </p>
            )}
            {!symptomLoading && symptoms.length === 0 && (
              <div className="empty-state">
                Nothing logged yet. You can start whenever you feel like
                tracking what your body is telling you.
              </div>
            )}
            {symptoms.length > 0 && (
              <ul className="list">
                {symptoms.map((s) => (
                  <li key={s._id} className="list-item text-sm">
                    <div className="row-between">
                      <span className="fw-600">{s.symptom}</span>
                      <span
                        className={`badge ${
                          s.severity >= 4
                            ? "badge-danger"
                            : s.severity >= 3
                            ? "badge-warning"
                            : "badge-success"
                        }`}
                      >
                        severity {s.severity}/5
                      </span>
                    </div>
                    <div className="text-xs subtle">
                      {new Date(s.dateTime || s.createdAt).toLocaleString()}{" "}
                      {s.cyclePhase && `· ${s.cyclePhase} phase`}
                    </div>
                    {s.notes && (
                      <div className="muted" style={{ marginTop: 4 }}>
                        {s.notes}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 6. Schedule next appointment */}
        <section className="card-muted stack">
          <div>
            <h3 className="card-title">Schedule your next appointment</h3>
            <p className="card-subtitle m-0">
              Add your upcoming doctor visit so you don’t have to keep
              everything in your head.
            </p>
          </div>
          <form onSubmit={handleApptSubmit} className="stack-sm">
            <label className="field">
              <span className="field-label">Doctor</span>
              <input
                className="input"
                type="text"
                placeholder="Doctor name"
                value={apptForm.doctorName}
                onChange={(e) =>
                  setApptForm({ ...apptForm, doctorName: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Specialty</span>
              <input
                className="input"
                type="text"
                placeholder="Specialty (e.g. Gynecologist)"
                value={apptForm.specialty}
                onChange={(e) =>
                  setApptForm({ ...apptForm, specialty: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Location</span>
              <input
                className="input"
                type="text"
                placeholder="Location / hospital"
                value={apptForm.location}
                onChange={(e) =>
                  setApptForm({ ...apptForm, location: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Date &amp; time</span>
              <input
                className="input"
                type="datetime-local"
                value={apptForm.dateTime}
                onChange={(e) =>
                  setApptForm({ ...apptForm, dateTime: e.target.value })
                }
              />
            </label>
            <div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={apptLoading}
              >
                {apptLoading ? "Saving…" : "Save appointment"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default WellnessPage;
