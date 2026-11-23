require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Routes
const resourcesRoutes = require("./routes/resources");
const authRoutes = require("./routes/auth");
const wellnessRoutes = require("./routes/wellness");
const aiRoutes = require("./routes/ai");
const periodRoutes = require("./routes/period");
const diaryRoutes = require("./routes/diary");
const medicalRoutes = require("./routes/medical");
const appointmentRoutes = require("./routes/appointments");
const fileRoutes = require("./routes/files");

const app = express();
const PORT = process.env.PORT || 4000;

// 🔹 Ensure upload folders exist (uploads, uploads/reports, uploads/ai-reports)
const uploadsDir = path.join(__dirname, "uploads");
const reportsDir = path.join(uploadsDir, "reports");
const aiReportsDir = path.join(uploadsDir, "ai-reports");
const symptomRoutes = require("./routes/symptoms");

[uploadsDir, reportsDir, aiReportsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log("📁 Created folder:", dir);
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// 🔒 Uploaded files are NOT served publicly any more.
// They are served only to their owner via GET /api/files/:filename (see routes/files.js).
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/resources", resourcesRoutes);
app.use("/api/wellness", wellnessRoutes);
app.use("/api/ai", aiRoutes); // mounted once, clean
app.use("/api/period", periodRoutes);
app.use("/api/diary", diaryRoutes);
app.use("/api/medical", medicalRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/symptoms", symptomRoutes);
app.use("/api/files", fileRoutes); // owner-only file access

// Health check
app.get("/", (req, res) => {
  res.send("Backend is running with auth ✅");
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });
