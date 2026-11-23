// frontend/src/components/AIChatVoice.jsx
import React, { useState, useEffect, useRef } from "react";
import { MicIcon, SendIcon } from "./Icons";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

export default function AIChatVoice() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi love, I’m your wellness voice assistant. 💜 You can talk to me like a friend, or ask me to do things for you.",
    },
    {
      role: "assistant",
      content:
        "For example, you can say things like:\n• “Book an appointment with Dr Rao next Tuesday at 4 pm”\n• “Write in my diary that I felt very anxious in class today”\n• “Which doctor should I see for heavy periods in Hyderabad?”\n• “My period started yesterday”\n• “I feel very low and lonely today”",
    },
  ]);
  const [listening, setListening] = useState(false);
  const [typing, setTyping] = useState(false);
  const [pendingText, setPendingText] = useState(""); // recognized text (editable)

  const recognitionRef = useRef(null);

  /* ---------------- TEXT TO SPEECH ---------------- */
  function speak(text) {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-IN";
      u.rate = 0.95;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.log("TTS error:", err);
    }
  }

  /* ------------- SEND CONFIRMED TEXT TO AI -------- */
  async function sendToAI(text) {
    if (!text.trim()) return;

    const token = localStorage.getItem("token");
    setTyping(true);

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: text }),
      });

      const data = await res.json();

      if (!res.ok) {
        const fallback =
          data.error || "Something went wrong while talking to me.";
        setMessages((m) => [...m, { role: "assistant", content: fallback }]);
        speak(fallback);
        return;
      }

      const reply = data.text || "I'm here for you.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      speak(reply);

      // 🔹 If you ever want, you can also use data.intent here
      // e.g. data.intent?.type === "appointment_created"
      // For now, reply text already explains what happened.
    } catch (err) {
      console.log("AI error:", err);
      const fallback =
        "I couldn't reach the server right now, but I'm still here to listen.";
      setMessages((m) => [...m, { role: "assistant", content: fallback }]);
      speak(fallback);
    } finally {
      setTyping(false);
    }
  }

  /* --------------- HANDLE SEND BUTTON -------------- */
  async function handleSendPending() {
    const text = pendingText.trim();
    if (!text) return;

    // show in chat as user message
    setMessages((m) => [...m, { role: "user", content: text }]);
    setPendingText("");

    await sendToAI(text);
  }

  /* --------------- INIT SPEECH RECOGNITION --------- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SR) {
      console.warn("Speech Recognition is not supported in this browser.");
      return;
    }

    const recog = new SR();
    recog.lang = "en-IN"; // try also "en-US" or "hi-IN" if you want
    recog.continuous = false; // one utterance per click
    recog.interimResults = true; // we gather final transcript at the end
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      console.log("🎤 recognition started");
      setListening(true);
    };

    recog.onend = () => {
      console.log("🛑 recognition ended");
      setListening(false);
    };

    recog.onerror = (e) => {
      console.log("❌ Speech error:", e.error);
      setListening(false);

      if (e.error === "no-speech") {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "I couldn't hear anything that time. Try speaking a little closer or louder, or you can type instead.",
          },
        ]);
      }
    };

    recog.onresult = (e) => {
      let finalTranscript = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript;
        }
      }

      const text = finalTranscript.trim();
      if (!text) {
        console.log("No final transcript (only interim or silence).");
        return;
      }

      console.log("✅ Recognized:", text);
      // show in editable box instead of sending directly
      setPendingText(text);
    };

    recognitionRef.current = recog;

    return () => {
      try {
        recog.stop();
      } catch {}
    };
  }, []); // runs once

  /* ----------------- START LISTENING BUTTON -------- */
  function startListening() {
    const recog = recognitionRef.current;
    if (!recog) {
      alert(
        "Speech recognition is not available in this browser. Try using Chrome on desktop."
      );
      return;
    }

    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      try {
        recog.stop();
      } catch {}

      setTimeout(() => {
        console.log("▶️ calling recog.start()");
        recog.start();
      }, 200);
    } catch (err) {
      console.log("Start listening error:", err);
    }
  }

  /* --------------------------- UI ------------------- */
  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>Wellness voice assistant</h2>
        <p>
          Talk to me like a friend, or ask me to book appointments, write in
          your diary and more. Tap the mic to start.
        </p>
      </div>

      {/* Chat window */}
      <div className="chat-log" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`msg ${m.role === "user" ? "msg-user" : "msg-bot"}`}
          >
            {m.content}
          </div>
        ))}

        {typing && (
          <div className="msg msg-bot" aria-label="Assistant is typing">
            <div className="typing-dots" />
          </div>
        )}
      </div>

      {/* Recognized text editor */}
      {pendingText && (
        <div className="card-muted stack-sm">
          <label className="field">
            <span className="field-label">
              Recognized text (you can edit before sending)
            </span>
            <textarea
              className="textarea"
              value={pendingText}
              onChange={(e) => setPendingText(e.target.value)}
              rows={3}
              style={{ minHeight: 80 }}
            />
          </label>
          <div className="row-sm" style={{ justifyContent: "flex-end" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setPendingText("")}
            >
              Clear
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSendPending}>
              <SendIcon size={15} />
              Send
            </button>
          </div>
        </div>
      )}

      {/* Mic button */}
      <div className="row" style={{ justifyContent: "center" }}>
        <button
          onClick={startListening}
          disabled={listening}
          className={`mic-btn${listening ? " is-listening" : ""}`}
          style={{ width: 64, height: 64 }}
          aria-label={listening ? "Listening…" : "Start speaking"}
        >
          <MicIcon size={26} />
        </button>
      </div>
      <div className="text-center subtle text-sm" style={{ marginTop: -8 }}>
        {listening ? "Listening…" : "Tap to speak"}
      </div>

      {/* How to talk to her (text hints, in case mic fails) */}
      <div className="card-muted text-sm">
        <div className="fw-600" style={{ marginBottom: 6 }}>
          You can say things like:
        </div>
        <ul className="muted" style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 4 }}>
          <li>
            <strong>Appointment:</strong> “Book an appointment with Dr Rao
            next Tuesday at 4 pm”
          </li>
          <li>
            <strong>Diary:</strong> “Write in my diary that I felt very anxious
            in class today”
          </li>
          <li>
            <strong>Doctor type:</strong> “Which doctor should I see for heavy
            periods in Hyderabad?”
          </li>
          <li>
            <strong>Periods:</strong> “My period started yesterday” / “My
            period ended today”
          </li>
          <li>
            <strong>Emotional:</strong> “I feel really low and lonely today”
          </li>
        </ul>
      </div>

      <style>
        {`
          .typing-dots {
            width: 36px;
            height: 8px;
            background: repeating-linear-gradient(
              to right,
              var(--accent) 0 8px,
              transparent 8px 12px
            );
            animation: blink 1s infinite;
          }

          @keyframes blink {
            0% { opacity: 0.3; }
            50% { opacity: 1; }
            100% { opacity: 0.3; }
          }
        `}
      </style>
    </div>
  );
}
