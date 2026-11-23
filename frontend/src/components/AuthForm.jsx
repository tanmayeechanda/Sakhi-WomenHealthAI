import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { BrandIcon, DropIcon, MicIcon, ShieldIcon } from "./Icons";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

function AuthForm({ onAuthSuccess }) {
  const [mode, setMode] = useState("login"); // 'login' or 'register'
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  // For reset password
  const [resetEmail, setResetEmail] = useState("");
  const [resetStatus, setResetStatus] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("Loading...");

    try {
      const endpoint =
        mode === "login"
          ? `${API_BASE}/auth/login`
          : `${API_BASE}/auth/register`;

      const body =
        mode === "login"
          ? { email, password }
          : { name, email, password, dob: dob || undefined };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Something went wrong");
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
        if (typeof onAuthSuccess === "function") {
          onAuthSuccess(data.token, data.user || null);
        }
      }

      setStatus(`Success! Logged in as ${data.user?.email || email}`);
    } catch (err) {
      console.error(err);
      setStatus("Network error");
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    try {
      const credential = credentialResponse.credential;
      if (!credential) {
        console.error("No credential from Google");
        setStatus("Google login failed");
        return;
      }

      const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Google login failed:", data);
        setStatus(data.error || "Google login failed");
        return;
      }

      if (data.token) {
        localStorage.setItem("token", data.token);
        if (typeof onAuthSuccess === "function") {
          onAuthSuccess(data.token, data.user || null);
        }
      }

      setStatus(`Success! Logged in as ${data.user?.email || "Google user"}`);
    } catch (err) {
      console.error("Google login error:", err);
      setStatus("Google login error");
    }
  }

  function handleGoogleError() {
    console.error("Google login was unsuccessful");
    setStatus("Google sign-in was cancelled or failed");
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setResetStatus("Sending reset link...");

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetStatus(data.error || "Something went wrong");
        return;
      }

      setResetStatus(
        data.message || "If this email exists, a reset link was sent.",
      );
    } catch (err) {
      console.error(err);
      setResetStatus("Network error");
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setStatus("");
  }

  const isSuccess = status.toLowerCase().includes("success");

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="brand">
          <div className="brand-mark">
            <BrandIcon size={18} />
          </div>
          <div className="brand-name">Sakhi</div>
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="eyebrow">Your wellness companion</div>
          <h2>Care that listens, every day of your cycle.</h2>
          <p>
            Track your cycle, journal how you feel, keep reports in one place
            and talk things through with a gentle AI assistant.
          </p>
          <ul className="auth-features">
            <li>
              <span className="icon-bubble"><DropIcon size={16} /></span>
              Cycle &amp; symptom tracking
            </li>
            <li>
              <span className="icon-bubble"><MicIcon size={16} /></span>
              Voice assistant that understands you
            </li>
            <li>
              <span className="icon-bubble"><ShieldIcon size={16} /></span>
              Your data stays private to your account
            </li>
          </ul>
        </div>

        <div className="subtle text-xs">
          Not a substitute for professional medical advice.
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card stack">
          <div>
            <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="muted m-0">
              {mode === "login"
                ? "Log in to continue tracking your cycle & chat with the AI."
                : "Start tracking your cycles and get supportive AI guidance."}
            </p>
          </div>

          {/* Login / Sign up toggle */}
          <div className="segmented segmented-block" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "is-active" : ""}
              onClick={() => switchMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "is-active" : ""}
              onClick={() => switchMode("register")}
            >
              Sign up
            </button>
          </div>

          {/* Main auth form */}
          <form onSubmit={handleSubmit} className="stack">
            {mode === "register" && (
              <>
                <label className="field">
                  <span className="field-label">Name</span>
                  <input
                    className="input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>

                <label className="field">
                  <span className="field-label">
                    Date of birth <span className="subtle">(optional)</span>
                  </span>
                  <input
                    className="input"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </label>
              </>
            )}

            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>

            <button type="submit" className="btn btn-primary btn-lg btn-block">
              {mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          {/* Main auth status */}
          {status && (
            <div className={`alert ${isSuccess ? "alert-success" : status === "Loading..." ? "alert-info" : "alert-error"}`} role="status">
              {status}
            </div>
          )}

          <div className="divider-label" style={{ margin: 0 }}>or</div>

          {/* Google Sign-in */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              shape="pill"
              text="continue_with"
            />
          </div>

          {/* Forgot password section */}
          {mode === "login" && (
            <div className="card-muted stack-sm">
              <div className="fw-600 text-sm">Forgot your password?</div>
              <form onSubmit={handleForgotPassword} className="row-sm">
                <input
                  className="input grow"
                  type="email"
                  placeholder="Enter your email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-soft">
                  Send link
                </button>
              </form>
              {resetStatus && <div className="text-sm muted">{resetStatus}</div>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AuthForm;
