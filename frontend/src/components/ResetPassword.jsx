// frontend/src/components/ResetPassword.jsx
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BrandIcon } from "./Icons";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("Updating password...");

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Something went wrong");
        return;
      }

      setStatus(data.message || "Password updated successfully!");

      // After a short delay, go back to login
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 2000);
    } catch (err) {
      console.error(err);
      setStatus("Network error");
    }
  }

  const isSuccess = status.toLowerCase().includes("success");
  const isPending = status === "Updating password...";

  return (
    <div className="center-screen">
      <div className="card auth-card stack">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">
            <BrandIcon size={18} />
          </div>
          <div className="brand-name">Women&apos;s Health AI</div>
        </div>

        <div>
          <h1>Reset your password</h1>
          <p className="muted m-0">Enter a new password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <label className="field">
            <span className="field-label">New password</span>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <button type="submit" className="btn btn-primary btn-lg btn-block">
            Update password
          </button>
        </form>

        {status && (
          <div
            className={`alert ${isSuccess ? "alert-success" : isPending ? "alert-info" : "alert-error"}`}
            role="status"
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
