// Uploaded files are private: the backend only serves them from
// GET /api/files/:filename to the logged-in owner. <img src> and <a href>
// can't send the Authorization header, so we fetch the file ourselves and
// show it through a temporary in-memory (blob:) URL.
import React, { useEffect, useState } from "react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

// "/uploads/diary/123.png" -> "http://localhost:4000/api/files/123.png"
function secureFileUrl(storedPath) {
  const filename = String(storedPath || "").split("/").pop();
  return `${API_BASE}/files/${encodeURIComponent(filename)}`;
}

async function fetchFileBlobUrl(storedPath) {
  const token = localStorage.getItem("token");
  const res = await fetch(secureFileUrl(storedPath), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`File request failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

/** <img> that loads a private uploaded image with the user's token. */
export function SecureImage({ path, alt = "", ...imgProps }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setFailed(false);
    fetchFileBlobUrl(path)
      .then((url) => {
        if (cancelled) URL.revokeObjectURL(url);
        else {
          objectUrl = url;
          setSrc(url);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) {
    return (
      <div
        className="thumb"
        style={{ width: imgProps.width, height: imgProps.height, display: "grid", placeItems: "center" }}
        title="Couldn't load this file"
      >
        <span className="text-xs subtle">—</span>
      </div>
    );
  }
  if (!src) {
    return (
      <div
        className="thumb"
        style={{ width: imgProps.width, height: imgProps.height, background: "var(--bg-tint)" }}
        aria-busy="true"
      />
    );
  }
  return <img src={src} alt={alt} {...imgProps} />;
}

/** Button that opens a private uploaded file in a new tab. */
export function SecureFileButton({ path, children, className }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setError("");
    // Open the tab synchronously (inside the click) so popup blockers allow it,
    // then point it at the file once it has downloaded.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const url = await fetchFileBlobUrl(path);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      // Give the new tab time to load before freeing the memory
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (tab) tab.close();
      setError("Couldn't open this file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="stack-sm" style={{ alignItems: "flex-end", gap: 4 }}>
      <button type="button" className={className} onClick={open} disabled={busy}>
        {busy ? "Opening…" : children}
      </button>
      {error && <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
    </span>
  );
}
