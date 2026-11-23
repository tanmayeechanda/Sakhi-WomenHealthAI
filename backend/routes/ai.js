// backend/routes/ai.js
const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");

// 🔹 models used by voice assistant intents
const Appointment = require("../models/Appointment");
const DiaryEntry = require("../models/DiaryEntry");
const PeriodEntry = require("../models/PeriodEntry");
const chrono = require("chrono-node");
const { getCycleStats, startOfDay } = require("../utils/cycle");
const { extractText, analyzeReportText } = require("../utils/reportAnalyzer");
const fs = require("fs");

/* ============================================================
   Free natural-language helpers (no AI service needed)
============================================================ */

const SPLIT_TOKENS = [" also ", " and then ", " then ", " and also ", ". "];

// Cut a sentence at the first "also / then" so one request doesn't swallow the next
function firstClause(text) {
  let clause = text;
  for (const tok of SPLIT_TOKENS) {
    const idx = clause.toLowerCase().indexOf(tok);
    if (idx > 0) clause = clause.slice(0, idx);
  }
  return clause;
}

function tidyDoctorName(raw) {
  let name = (raw || "")
    .replace(/[,.;:!?]+$/g, "")
    .replace(/\b(on|at|for|this|next|tomorrow|today|in|from)\s*$/i, "")
    .trim()
    .replace(/^(dr\.?|doctor)(\s+|$)/i, "")
    .trim();
  if (!name || /^(a|an|the|my)$/i.test(name)) return "";
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return `Dr ${name}`;
}

/**
 * Understands e.g.
 *   "fix an appointment with Dr Rao next Tuesday at 4pm"
 *   "book doctor Meena tomorrow evening at 6"
 *   "appointment on 12 December at 11 am with Dr Sricharan"
 * Returns { doctorName, date, problem } where problem is
 *   "no_doctor" | "no_date" | "no_time" | "past" | null
 */
function parseAppointmentRequest(rawContent, now = new Date()) {
  // "Dr." -> "Dr", "a.m." -> "am", so full stops don't split the sentence
  const content = rawContent
    .replace(/\b(dr|mr|mrs|ms)\./gi, "$1")
    .replace(/\b([ap])\.\s?m\b\.?/gi, "$1m");
  const lower = content.toLowerCase();
  const startMatch = lower.match(/\b(appointment|appt|book|schedule|fix)\b/);
  const clause = firstClause(startMatch ? content.slice(startMatch.index) : content);

  const results = chrono.parse(clause, now, { forwardDate: true });
  const when = results[0];

  // Doctor = words after "with" (or from "Dr"/"doctor"), excluding the date text
  let doctorName = "";
  const withMatch = clause.match(/\bwith\s+/i);
  const drMatch = clause.match(/\b(dr\.?|doctor)\s+/i);
  const nameStart = withMatch
    ? withMatch.index + withMatch[0].length
    : drMatch
    ? drMatch.index
    : -1;
  if (nameStart !== -1) {
    let nameEnd = clause.length;
    if (when && when.index > nameStart) nameEnd = when.index;
    doctorName = tidyDoctorName(clause.slice(nameStart, nameEnd));
  }

  if (!doctorName) return { problem: "no_doctor" };
  if (!when) return { doctorName, problem: "no_date" };
  if (!when.start.isCertain("hour")) return { doctorName, problem: "no_time" };
  const date = when.start.date();
  if (date < now) return { doctorName, date, problem: "past" };
  return { doctorName, date, problem: null };
}

// "my period started yesterday" -> yesterday; no date given -> today; never in the future
function parsePastDate(content, now = new Date()) {
  const found = chrono.parse(content, now)[0];
  if (!found) return now;
  const d = found.start.date();
  return d > now ? now : d;
}

function friendlyDate(d) {
  return new Date(d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/* ============================================================
   MULTER SETUP FOR FILE-BASED REPORT EXPLANATION
   Files will be stored in: backend/uploads/ai-reports
============================================================ */
const aiUploadsDir = path.join(__dirname, "..", "uploads", "ai-reports");

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, aiUploadsDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, `${Date.now()}-ai-${baseName}${ext}`);
  },
});

const ALLOWED_REPORT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
];
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB, one file
  fileFilter(req, file, cb) {
    if (ALLOWED_REPORT_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Please upload a PDF or an image (JPG, PNG, WEBP)."));
  },
});

/* ============================================================
   1) VOICE ASSISTANT CHAT + MULTI-INTENT
   POST /api/ai/chat
============================================================ */
router.post("/chat", requireAuth, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const text = content.toLowerCase().trim();

    // helper: infer mood keyword for diary entries
    function inferMood(t) {
      if (
        t.includes("happy") ||
        t.includes("excited") ||
        t.includes("good") ||
        t.includes("grateful")
      )
        return "happy";
      if (
        t.includes("sad") ||
        t.includes("cry") ||
        t.includes("lonely") ||
        t.includes("empty") ||
        t.includes("worthless")
      )
        return "sad";
      if (
        t.includes("anxious") ||
        t.includes("anxiety") ||
        t.includes("panic") ||
        t.includes("worried") ||
        t.includes("stressed") ||
        t.includes("stress")
      )
        return "anxious";
      if (
        t.includes("angry") ||
        t.includes("frustrated") ||
        t.includes("irritated") ||
        t.includes("pissed") ||
        t.includes("rage")
      )
        return "angry";
      return "neutral";
    }

    /* -----------------------------------------------
       A) DETECT INTENTS (can be more than one)
    ------------------------------------------------ */

    const hasAppointment =
      /\b(appointment|appt)\b/.test(text) ||
      (/\b(book|schedule)\b/.test(text) && /\b(dr\.?|doctor)\b/.test(text));
    const hasDiary =
      text.includes("write in my diary") ||
      text.includes("add to my diary") ||
      text.includes("note in my diary") ||
      text.startsWith("dear diary");
    const hasDoctorHelp =
      text.includes("which doctor") ||
      text.includes("what doctor") ||
      text.includes("doctor should i see") ||
      text.includes("search doctor") ||
      text.includes("find a doctor");
    const hasPeriodEnd =
      /\bperiods?\s+(has\s+|have\s+|is\s+|are\s+)?(ended|stopped|finished|over|done)\b/.test(text);
    const hasPeriodStart =
      !hasPeriodEnd &&
      (/\bperiods?\s+(has\s+|have\s+)?(started|start|began|begun|came)\b/.test(text) ||
        /\b(got|getting|log)\s+my\s+periods?\b/.test(text) ||
        /\b(on|started)\s+my\s+periods?\b/.test(text));
    const hasPeriodMention = hasPeriodStart || hasPeriodEnd;

    const replyParts = [];
    const intentSummary = {};

    /* -----------------------------------------------
       B) HANDLE APPOINTMENT INTENT (more forgiving)
       Examples:
       - "fix an appointment with doctor Tanmay on December 12 at 4pm"
       - "appointment with Dr Sri Charan on 11th December 2025 at 12:00 p.m."
       - "appointment with doctor X on 11 December 2025"
    ------------------------------------------------ */
    if (hasAppointment) {
      try {
        const appt = parseAppointmentRequest(content);
        const example =
          "For example: “Book an appointment with Dr Rao next Tuesday at 4 pm.”";

        if (appt.problem === "no_doctor") {
          replyParts.push(
            `I can book that appointment – which doctor is it with? ${example}`
          );
          intentSummary.appointment = { type: "appointment_not_parsed" };
        } else if (appt.problem === "no_date") {
          replyParts.push(
            `When is your appointment with ${appt.doctorName}? ${example}`
          );
          intentSummary.appointment = { type: "appointment_parse_error" };
        } else if (appt.problem === "no_time") {
          replyParts.push(
            `What time is your appointment with ${appt.doctorName}? Please say the day and time together, e.g. “tomorrow at 11 am”.`
          );
          intentSummary.appointment = { type: "appointment_parse_error" };
        } else if (appt.problem === "past") {
          replyParts.push(
            `That time (${appt.date.toLocaleString()}) is already in the past, so I didn’t save it. Could you tell me the date again?`
          );
          intentSummary.appointment = { type: "appointment_parse_error" };
        } else {
          const appointment = await Appointment.create({
            user: req.user._id,
            doctorName: appt.doctorName,
            specialty: "",
            location: "",
            dateTime: appt.date,
          });

          const time = appt.date.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          });
          replyParts.push(
            `Okay, I’ve added this appointment:\n• Doctor: ${appt.doctorName}\n• When: ${friendlyDate(appt.date)} at ${time}\nYou’ll see it on your Wellness page under “Next appointment”.`
          );

          intentSummary.appointment = {
            type: "appointment_created",
            appointmentId: appointment._id,
            doctorName: appt.doctorName,
            dateTime: appointment.dateTime,
          };
        }
      } catch (e) {
        console.error("Voice appointment create error:", e);
        replyParts.push(
          "I tried to save your appointment, but something went wrong. Please try again or add it in the Wellness page."
        );
        intentSummary.appointment = { type: "appointment_error" };
      }
    }

    /* -----------------------------------------------
       C) HANDLE DIARY INTENT
       e.g. "write in my diary that I am feeling bad"
    ------------------------------------------------ */
    if (hasDiary) {
      try {
        let diaryText = content;

        const lowerContent = content.toLowerCase();
        const keyPhrases = [
          "write in my diary that",
          "add to my diary that",
          "note in my diary that",
        ];

        let startPos = -1;
        for (const phrase of keyPhrases) {
          const idx = lowerContent.indexOf(phrase);
          if (idx !== -1) {
            startPos = idx + phrase.length;
            break;
          }
        }

        if (startPos !== -1) {
          diaryText = content.slice(startPos).trim();
        } else if (lowerContent.startsWith("dear diary")) {
          diaryText = content.slice("dear diary".length).trim();
        }

        const mood = inferMood(text);

        const entry = await DiaryEntry.create({
          user: req.user._id,
          date: new Date(),
          text: diaryText,
          mood,
          private: true,
        });

        replyParts.push(
          "I’ve written that in your diary for today. 📝 You can see it in your Personal Diary section whenever you want."
        );
        intentSummary.diary = {
          type: "diary_created",
          diaryId: entry._id,
          mood,
        };
      } catch (e) {
        console.error("Voice diary create error:", e);
        replyParts.push(
          "I tried to write this in your diary, but something went wrong. Please try again later."
        );
        intentSummary.diary = { type: "diary_error" };
      }
    }

    /* -----------------------------------------------
       D) HANDLE DOCTOR TYPE SUGGESTION
       e.g. "which doctor should I see for heavy periods in Hyderabad"
    ------------------------------------------------ */
    if (hasDoctorHelp) {
      try {
        let city = null;
        const cityMatch = content.match(/\bin\s+([a-zA-Z\s]+)$/i);
        if (cityMatch) {
          city = cityMatch[1].trim();
        }

        const issue = text;

        let specialty = "General physician";
        if (
          issue.includes("period") ||
          issue.includes("pcos") ||
          issue.includes("pelvic") ||
          issue.includes("gyne")
        ) {
          specialty = "Gynecologist";
        } else if (issue.includes("thyroid") || issue.includes("hormone")) {
          specialty = "Endocrinologist";
        } else if (issue.includes("skin") || issue.includes("acne")) {
          specialty = "Dermatologist";
        } else if (
          issue.includes("anxiety") ||
          issue.includes("depression") ||
          issue.includes("panic") ||
          issue.includes("mental")
        ) {
          specialty = "Psychiatrist or Psychologist";
        } else if (
          issue.includes("fever") ||
          issue.includes("cold") ||
          issue.includes("cough")
        ) {
          specialty = "General physician";
        }

        const displayCity = city || "your area";
        const q = encodeURIComponent(`${specialty} near ${displayCity}`);
        const googleSearchUrl = `https://www.google.com/search?q=${q}`;
        const googleMapsUrl = `https://www.google.com/maps/search/${q}`;
        const practoSearchUrl = `https://www.practo.com/search/doctors?results_type=doctor&q=${encodeURIComponent(
          specialty
        )}&city=${encodeURIComponent(city || "")}`;

        const docText =
          `Based on what you told me, a **${specialty}** sounds like a good doctor to talk to.\n\n` +
          `You can look for:\n` +
          `• On Google: "${specialty} near ${displayCity}"\n` +
          `• On Google Maps or Practo to see ratings, reviews, and timings.\n\n` +
          `I can’t book directly for you, but I can help you remember appointments once you decide. 💊`;

        replyParts.push(docText);
        intentSummary.doctor = {
          type: "doctor_suggestion",
          specialty,
          city: city || null,
          searchLinks: {
            googleSearchUrl,
            googleMapsUrl,
            practoSearchUrl,
          },
        };
      } catch (e) {
        console.error("Voice doctor-suggest error:", e);
        replyParts.push(
          "I tried to think about which doctor you should see, but something went wrong. Please try again."
        );
        intentSummary.doctor = { type: "doctor_error" };
      }
    }

    /* -----------------------------------------------
       E) HANDLE PERIOD MENTION
       e.g. "my periods started today"
    ------------------------------------------------ */
    if (hasPeriodMention) {
      try {
        const day = startOfDay(parsePastDate(content));

        if (hasPeriodStart) {
          // Don't log the same day twice
          const nextDay = new Date(day);
          nextDay.setDate(nextDay.getDate() + 1);
          const existing = await PeriodEntry.findOne({
            user: req.user._id,
            startDate: { $gte: day, $lt: nextDay },
          });
          if (!existing) {
            await PeriodEntry.create({
              user: req.user._id,
              startDate: day,
              flow: "moderate",
            });
          }

          const entries = await PeriodEntry.find({ user: req.user._id })
            .select("startDate endDate")
            .lean();
          const stats = getCycleStats(entries);
          const basis = stats.isPersonalised
            ? `your average ${stats.avgCycleLength}-day cycle`
            : "a typical 28-day cycle";
          const forecast = stats.nextPeriodDate
            ? `Based on ${basis}, your next period is expected around ${friendlyDate(stats.nextPeriodDate)}.`
            : "";
          const logged = existing
            ? "That day was already logged"
            : `I’ve logged your period starting ${friendlyDate(day)}`;

          replyParts.push(
            `${logged}. 🌸 ${forecast}\n\nBe gentle with yourself – rest, warmth and water can help. When it ends, just tell me “my period ended”.`
          );
          intentSummary.period = { type: "period_started", date: day };
        } else {
          // Period ended: close the most recent period that started on or before that day
          const endOfDay = new Date(day);
          endOfDay.setDate(endOfDay.getDate() + 1);
          const latest = await PeriodEntry.findOne({
            user: req.user._id,
            startDate: { $lt: endOfDay },
          }).sort({ startDate: -1 });

          if (!latest) {
            replyParts.push(
              "I couldn’t find a period to close. If your period started recently, tell me “my period started on …” first."
            );
            intentSummary.period = { type: "period_end_no_start" };
          } else {
            latest.endDate =
              day < startOfDay(latest.startDate) ? latest.startDate : day;
            await latest.save();
            replyParts.push(
              `Got it – I’ve marked your period as ended on ${friendlyDate(latest.endDate)}. 💜`
            );
            intentSummary.period = { type: "period_ended", date: latest.endDate };
          }
        }
      } catch (e) {
        console.error("Voice period log error:", e);
        replyParts.push(
          "I tried to log your period, but something went wrong. Please use the Cycle tracker tab instead."
        );
        intentSummary.period = { type: "period_error" };
      }
    }

    /* -----------------------------------------------
       F) IF WE DID ANY ACTION ABOVE → RETURN COMBINED
    ------------------------------------------------ */
    if (replyParts.length > 0) {
      return res.json({
        text: replyParts.join("\n\n"),
        intent: intentSummary,
      });
    }

    /* -----------------------------------------------
       G) EMOTIONAL SUPPORT (fallback – your old logic)
    ------------------------------------------------ */

    let reply;

    const breakupWords = ["break up", "broke up", "breakup", "separated"];
    const relationshipWords = [
      "boyfriend",
      "gf",
      "girlfriend",
      "relationship",
      "ex",
    ];

    const isBreakup =
      breakupWords.some((w) => text.includes(w)) ||
      (relationshipWords.some((w) => text.includes(w)) &&
        (text.includes("left") ||
          text.includes("cheated") ||
          text.includes("hurt") ||
          text.includes("ended")));

    const isVerySad =
      text.includes("i am sad") ||
      text.includes("i'm sad") ||
      text.includes("feeling low") ||
      text.includes("very low") ||
      text.includes("depressed") ||
      text.includes("empty") ||
      text.includes("worthless") ||
      text.includes("crying") ||
      text.includes("cried");

    const isAnxious =
      text.includes("anxious") ||
      text.includes("anxiety") ||
      text.includes("overthinking") ||
      text.includes("over thinking") ||
      text.includes("panic") ||
      text.includes("scared") ||
      text.includes("worried") ||
      text.includes("nervous");

    const isAngry =
      text.includes("angry") ||
      text.includes("frustrated") ||
      text.includes("irritated") ||
      text.includes("pissed") ||
      text.includes("mad") ||
      text.includes("rage");

    const isLonely =
      text.includes("lonely") ||
      text.includes("alone") ||
      text.includes("no one cares") ||
      text.includes("nobody cares") ||
      text.includes("no one understands") ||
      text.includes("nobody understands") ||
      text.includes("ignored");

    const isPeriodRelated =
      text.includes("period") ||
      text.includes("cramp") ||
      text.includes("pms") ||
      text.includes("bleeding") ||
      text.includes("menstrual") ||
      text.includes("pcos");

    if (isBreakup) {
      reply = `
I’m really, really sorry that you’re going through this. 💔  
Breakups can feel like the ground has been pulled from under you, especially when it’s someone you deeply cared about.

Your pain is valid. It makes sense that you’re hurting right now.  
You don’t have to “move on” quickly or pretend you’re okay.

If you feel comfortable, tell me:
- What hurts the most about this breakup right now?
- Are you feeling more sad, angry, numb, or something else?

I’m here with you, and I’m not judging you at all. Just talk to me at your pace.
      `.trim();
    } else if (isVerySad) {
      reply = `
I'm really sorry that you're feeling this sad. 💜  
You don’t have to minimize your feelings — what you’re going through matters.

Sometimes sadness feels heavy, like you’re carrying it alone.  
But right now, you’re *not* alone. I’m here, listening just to you.

If you feel ready, you can tell me:
- What made today especially hard?
- Are there specific thoughts that keep coming back?

We can unpack it gently, step by step.
      `.trim();
    } else if (isAnxious) {
      reply = `
It sounds like your mind has been running non-stop, and that can be exhausting. 😔  
Anxiety can make even small things feel overwhelming, and that’s not your fault.

Let’s try something tiny together:
- Inhale slowly for 4 seconds  
- Hold for 4 seconds  
- Exhale for 6 seconds  

You can repeat that 3 times, and then tell me:
What are some of the thoughts that keep looping in your mind?  
You don’t have to solve everything right now — just share one piece with me.
      `.trim();
    } else if (isAngry) {
      reply = `
I can feel how much anger and frustration you're holding inside. 🔥  
It’s okay to feel angry — it usually means something important to you was hurt, disrespected, or ignored.

You don’t have to suppress it here. You can let it out in words.

If you want, you can tell me:
- What exactly happened?
- What feels the most unfair about it?

I’ll listen patiently, without telling you to “calm down” or “let it go.” Your feelings are real.
      `.trim();
    } else if (isLonely) {
      reply = `
Feeling lonely is such a heavy experience, especially when it seems like no one truly understands you. 💧

I’m really glad you reached out instead of staying completely silent inside your thoughts.  
You deserve connection, gentleness, and people who care.

Right now, I’m here with you. You’re not invisible to me.

If you’d like, tell me:
- When do you feel this loneliness the most — at night, after class, after talking to someone?
- Do you remember a moment when you felt a little less alone?

We can slowly explore this together.
      `.trim();
    } else if (isPeriodRelated) {
      reply = `
I'm sorry your body is feeling uncomfortable right now. 🌸  
Periods, cramps, hormonal swings — they can affect not only the body but also your mood and energy.

Some gentle comforts you might try (if they’re safe for you):
- Warm water bag on your lower abdomen  
- Light stretches or a slow walk  
- Warm water or herbal tea  
- Soft, non-judgmental rest (you *are* allowed to rest)

If you want, you can tell me:
- Are your cramps more physical, or do you feel emotionally drained too?

Remember: if pain is severe or bleeding is very heavy, it’s important to talk to a real doctor.
      `.trim();
    } else {
      reply = `
Thank you for sharing this with me. 💜  
From what you said:

"${content}"

…it sounds like you’re carrying a lot inside right now.

I’m here to listen, without judging or rushing you.  
If you’d like, you can tell me a bit more about:
- What made you feel this way today?
- What’s the one thing on your mind that feels the heaviest?

You don’t have to be “fine” with me. You’re allowed to feel exactly how you feel.
      `.trim();
    }

    return res.json({ text: reply, intent: null });
  } catch (err) {
    console.error("AI Chat Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================================
   2) MOOD SUGGESTIONS
   POST /api/ai/mood-suggestions
============================================================ */
router.post("/mood-suggestions", requireAuth, async (req, res) => {
  try {
    const { mood, cyclePhase, restrictions } = req.body || {};

    const actionsByMood = {
      anxious: [
        "Try 5-minute box breathing: inhale 4s, hold 4s, exhale 6s.",
        "Grounding method: name 5 things you see, 4 you can touch, 3 you hear.",
        "Take a short walk or stretch gently.",
      ],
      sad: [
        "Write down 3 things you are grateful for today.",
        "Listen to calming music you like.",
        "Talk to someone you trust or take a peaceful walk.",
      ],
      angry: [
        "Try progressive muscle relaxation.",
        "Step away for 5 minutes, take 3 slow deep breaths.",
        "Write your feelings on paper then close it.",
      ],
      calm: [
        "Continue your calming routine and hydrate.",
        "A short mindfulness check-in can help refresh your mind.",
        "Light stretching or yoga for balance.",
      ],
      neutral: [
        "Drink water and take a small break.",
        "Do one tiny activity you enjoy.",
        "Stretch for 2 minutes.",
      ],
    };

    const foodByPhase = {
      period: [
        "Iron-rich foods: spinach, lentils, tofu.",
        "Ginger tea to ease cramps (if safe for you).",
        "Oats or sweet potatoes for steady energy.",
      ],
      follicular: [
        "High-protein meals with colourful veggies.",
        "Berries and leafy greens.",
        "Nuts and seeds for energy.",
      ],
      ovulation: [
        "Foods with healthy fats like avocado and nuts.",
        "Pumpkin seeds, eggs, or plant-based zinc sources.",
        "High-fiber fruits.",
      ],
      luteal: [
        "Magnesium foods: bananas, nuts, dark chocolate (in moderation).",
        "Warm herbal teas.",
        "Sweet potato or millets for steady energy.",
      ],
    };

    const chosenMood = (mood || "neutral").toLowerCase();
    const chosenPhase = (cyclePhase || "period").toLowerCase();

    let actions = actionsByMood[chosenMood] || actionsByMood["neutral"];
    let foods = foodByPhase[chosenPhase] || foodByPhase["period"];

    if (restrictions && typeof restrictions === "string") {
      if (/vegan/i.test(restrictions)) {
        foods = foods.map((f) =>
          f.replace(/eggs|fish|dairy/gi, "plant-based alternatives")
        );
      }
    }

    return res.json({
      actions,
      foods,
      checkin:
        "If you ever feel severe pain, extremely heavy bleeding, or suicidal thoughts, please seek immediate medical help.",
    });
  } catch (err) {
    console.error("Mood Suggestion Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================================
   3) TEXT REPORT EXPLANATION
   POST /api/ai/report-explain   { reportText }
   Reads pasted lines like "TSH 6.5 mIU/L (0.4-4.0)" and flags them.
============================================================ */
const SAFE_NOTICE =
  "This is an automatic reading, not a medical diagnosis. Always discuss your results with your doctor.";

router.post("/report-explain", requireAuth, async (req, res) => {
  try {
    const { reportText } = req.body;
    if (!reportText || !reportText.trim()) {
      return res.status(400).json({ error: "Report text is required" });
    }
    const { findings, explanation } = analyzeReportText(reportText);
    res.json({ explanation, findings, safeNotice: SAFE_NOTICE });
  } catch (err) {
    console.error("report-explain error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================================
   3B) FILE REPORT EXPLANATION
   POST /api/ai/report-explain-file   (multipart, field "file")
   PDF -> text layer; photo/scan -> free OCR (tesseract.js).
   The uploaded file is deleted as soon as it has been read.
============================================================ */
router.post("/report-explain-file", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message =
        uploadErr.code === "LIMIT_FILE_SIZE"
          ? "That file is too big – please upload a report under 10 MB."
          : uploadErr.message || "Upload failed";
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Report file is required" });
    }

    try {
      const { text, method } = await extractText(req.file.path, req.file.mimetype);

      if (method === "pdf" && text.trim().length < 20) {
        return res.json({
          explanation:
            "This PDF looks like a scanned image, so there's no text inside it for me to read.\n\nTip: take a clear photo or screenshot of the results page and upload that image instead – I can read photos.",
          findings: [],
          method,
          safeNotice: SAFE_NOTICE,
        });
      }

      const { findings, explanation } = analyzeReportText(text);
      return res.json({ explanation, findings, method, safeNotice: SAFE_NOTICE });
    } catch (err) {
      console.error("report-explain-file error:", err);
      return res.status(500).json({
        error:
          "I couldn't read this file. If it's a photo, make sure it's clear and well lit, then try again.",
      });
    } finally {
      // Privacy: this upload was only needed for this one reading
      fs.unlink(req.file.path, () => {});
    }
  });
});

/* ============================================================
   4) DOCTOR TYPE SUGGESTION + SMART SEARCH LINKS (NO GOOGLE API)
   POST /api/ai/doctor-suggest
============================================================ */
router.post("/doctor-suggest", requireAuth, async (req, res) => {
  try {
    const { mainIssue, city } = req.body || {};
    const issue = (mainIssue || "").toLowerCase();
    const trimmedCity = (city || "").trim();

    let specialty = "General physician";
    if (
      issue.includes("period") ||
      issue.includes("pcos") ||
      issue.includes("pelvic") ||
      issue.includes("gyne")
    ) {
      specialty = "Gynecologist";
    } else if (issue.includes("thyroid") || issue.includes("hormone")) {
      specialty = "Endocrinologist";
    } else if (issue.includes("skin") || issue.includes("acne")) {
      specialty = "Dermatologist";
    } else if (
      issue.includes("anxiety") ||
      issue.includes("depression") ||
      issue.includes("panic") ||
      issue.includes("mental")
    ) {
      specialty = "Psychiatrist / Psychologist";
    } else if (
      issue.includes("fever") ||
      issue.includes("cold") ||
      issue.includes("cough")
    ) {
      specialty = "General physician";
    }

    const displayCity = trimmedCity || "your area";

    const message =
      `Based on what you wrote, a ${specialty} might be appropriate. ` +
      `This is not a diagnosis. Please visit a licensed doctor for proper evaluation.\n\n` +
      `Below are some helpful links where you can search for top-rated ${specialty}s near ${displayCity}. ` +
      `Please double-check reviews, timings, and availability yourself before visiting.`;

    const q = encodeURIComponent(`${specialty} near ${displayCity}`);
    const googleSearchUrl = `https://www.google.com/search?q=${q}`;
    const googleMapsUrl = `https://www.google.com/maps/search/${q}`;
    const practoSearchUrl = `https://www.practo.com/search/doctors?results_type=doctor&q=${encodeURIComponent(
      specialty
    )}&city=${encodeURIComponent(trimmedCity || "")}`;

    return res.json({
      specialty,
      city: trimmedCity || null,
      message,
      doctors: [],
      searchLinks: {
        googleSearchUrl,
        googleMapsUrl,
        practoSearchUrl,
      },
      note: "Use these links to see real doctors, ratings, and reviews near you. This app only guides you on the type of doctor.",
    });
  } catch (err) {
    console.error("doctor-suggest error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ============================================================
   5) COMFORT / REMEDY SUGGESTIONS
   POST /api/ai/remedy-suggest
============================================================ */
router.post("/remedy-suggest", requireAuth, async (req, res) => {
  try {
    const { symptom, cyclePhase } = req.body || {};
    const s = (symptom || "").toLowerCase();
    const phase = (cyclePhase || "period").toLowerCase();

    const baseWarning =
      "These are general comfort tips, not medical treatment. If pain is severe, bleeding is heavy, or you feel very unwell, please see a doctor urgently.";

    let tips = [
      "Rest when you feel tired.",
      "Drink water regularly.",
      "Track your symptoms to share with your doctor.",
    ];

    if (s.includes("cramp") || s.includes("pain")) {
      tips = [
        "Use a warm water bag on your lower abdomen if it is safe for you.",
        "Gentle stretching or slow walking can sometimes ease cramps.",
        "Try to eat light, balanced meals instead of skipping food.",
      ];
    } else if (s.includes("bloat") || s.includes("gas")) {
      tips = [
        "Limit very salty or processed foods and fizzy drinks.",
        "Sip warm water or light herbal tea.",
        "Wear loose, comfortable clothing around your stomach.",
      ];
    } else if (
      s.includes("mood") ||
      s.includes("anxiety") ||
      s.includes("low") ||
      s.includes("sad")
    ) {
      tips = [
        "Try 5–10 minutes of deep breathing or grounding exercises.",
        "Write your feelings in a journal without judging yourself.",
        "Reach out to a trusted person or helpline if you feel overwhelmed.",
      ];
    }

    res.json({
      tips,
      phase,
      warning: baseWarning,
    });
  } catch (err) {
    console.error("remedy-suggest error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
