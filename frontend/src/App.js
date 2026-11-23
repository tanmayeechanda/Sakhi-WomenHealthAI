// frontend/src/App.js
import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import AuthForm from "./components/AuthForm";
import Dashboard from "./components/dashboard";
import ResetPassword from "./components/ResetPassword"; // make sure this file exists

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [checkingToken, setCheckingToken] = useState(!!token);

  // Called when login/register succeeds
  const handleAuthSuccess = (newToken, userData) => {
    if (newToken) {
      localStorage.setItem("token", newToken);
      setToken(newToken);
    }
    if (userData) {
      setUser(userData);
    } else {
      setUser(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
  };

  // Verify token & fetch user on first load / token change
  useEffect(() => {
    async function checkToken() {
      if (!token) {
        setCheckingToken(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          // token invalid/expired -> logout
          localStorage.removeItem("token");
          setToken("");
          setUser(null);
        } else {
          const data = await res.json();
          setUser(data);
        }
      } catch (err) {
        console.error("Error verifying token:", err);
        // in doubt, log out
        localStorage.removeItem("token");
        setToken("");
        setUser(null);
      } finally {
        setCheckingToken(false);
      }
    }

    checkToken();
  }, [token]);

  // This controls what shows at "/"
  const AppShell = () => {
    if (checkingToken) {
      return (
        <div className="center-screen">
          <div className="stack-sm" style={{ alignItems: "center" }}>
            <div className="spinner" />
            <div className="muted text-sm">Checking your session…</div>
          </div>
        </div>
      );
    }

    if (!token) {
      return <AuthForm onAuthSuccess={handleAuthSuccess} />;
    }

    return <Dashboard user={user} token={token} onLogout={handleLogout} />;
  };

  return (
    <Routes>
      {/* Main app (login or dashboard) */}
      <Route path="/" element={<AppShell />} />

      {/* Password reset page from email link */}
      <Route path="/reset-password/:token" element={<ResetPassword />} />
    </Routes>
  );
}

export default App;
