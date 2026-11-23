// backend/routes/files.js
// Serves uploaded files ONLY to the user who owns them.
const express = require("express");
const path = require("path");
const fs = require("fs");
const { requireAuth } = require("../middleware/auth");
const MedicalReport = require("../models/MedicalReport");
const DiaryEntry = require("../models/DiaryEntry");

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// Escape a string so it can be used safely inside a RegExp
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * GET /api/files/:filename
 * 1) requireAuth verifies the JWT and sets req.user
 * 2) the file must be referenced by one of THIS user's MedicalReport or DiaryEntry docs
 * 3) only then is the file streamed; otherwise 403
 */
router.get("/:filename", requireAuth, async (req, res) => {
  try {
    // Strip any directory parts so "../../.env" style requests can't escape uploads/
    const filename = path.basename(req.params.filename);
    if (!filename || filename !== req.params.filename) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    // Stored paths look like "/uploads/reports/<file>" or "/uploads/diary/<file>"
    const endsWithFile = new RegExp(`/${escapeRegex(filename)}$`);
    const userId = req.user._id;

    let storedPath = null;

    const report = await MedicalReport.findOne({ user: userId, filePath: endsWithFile })
      .select("filePath")
      .lean();
    if (report) {
      storedPath = report.filePath;
    } else {
      const entry = await DiaryEntry.findOne({ user: userId, photos: endsWithFile })
        .select("photos")
        .lean();
      if (entry) storedPath = entry.photos.find((p) => endsWithFile.test(p));
    }

    if (!storedPath) {
      return res.status(403).json({ error: "You do not have access to this file" });
    }

    // Resolve the stored path inside uploads/ and double-check it stays there
    const relative = storedPath.replace(/^\/?uploads\//, "");
    const absolute = path.resolve(UPLOADS_DIR, relative);
    if (!absolute.startsWith(UPLOADS_DIR + path.sep)) {
      return res.status(403).json({ error: "You do not have access to this file" });
    }

    if (!fs.existsSync(absolute)) {
      return res.status(404).json({ error: "File not found" });
    }

    res.setHeader("Cache-Control", "private, no-store");
    return res.sendFile(absolute);
  } catch (err) {
    console.error("File serve error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
