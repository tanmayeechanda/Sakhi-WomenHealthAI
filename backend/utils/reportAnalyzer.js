// backend/utils/reportAnalyzer.js
// Free, offline-friendly report reader:
//   1) get the text out of the file (PDF text layer, or OCR for photos/scans)
//   2) find common lab tests + their values
//   3) compare with the range printed on the report, or a typical adult-female range
// It explains words and flags values – it never diagnoses.

const fs = require("fs");
const path = require("path");

const OCR_CACHE = path.join(__dirname, "..", ".cache", "tesseract");

/* ------------------------------------------------------------------ */
/* 1) Text extraction                                                  */
/* ------------------------------------------------------------------ */

async function extractText(filePath, mimeType) {
  if (mimeType === "application/pdf") {
    // lib path avoids pdf-parse's debug-mode bug when required from index.js
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const data = await pdfParse(fs.readFileSync(filePath));
    return { text: data.text || "", method: "pdf" };
  }

  if (/^image\/(png|jpe?g|webp|bmp)$/.test(mimeType)) {
    const { createWorker } = require("tesseract.js");
    fs.mkdirSync(OCR_CACHE, { recursive: true });
    // First use downloads the English language data (~10 MB) once, then it's cached
    const worker = await createWorker("eng", 1, { cachePath: OCR_CACHE });
    try {
      const { data } = await worker.recognize(filePath);
      return { text: data.text || "", method: "ocr" };
    } finally {
      await worker.terminate(); // free memory straight away
    }
  }

  return { text: "", method: "unsupported" };
}

/* ------------------------------------------------------------------ */
/* 2) Known tests                                                      */
/* Typical adult female reference ranges. Labs differ, so a range      */
/* printed on the report always wins.                                  */
/* ------------------------------------------------------------------ */

const TESTS = [
  {
    key: "hb", name: "Haemoglobin", unit: "g/dL", low: 12, high: 15.5,
    aliases: [/\bh(a)?emoglobin\b/i, /\bhgb\b/i, /\bhb\b(?!a1c)/i],
    lowNote: "Low haemoglobin can mean anaemia, which often causes tiredness, breathlessness or dizziness. Heavy periods and low iron are common causes in women.",
    highNote: "High haemoglobin can happen with dehydration or smoking, and sometimes other conditions.",
  },
  {
    key: "rbc", name: "Red blood cells (RBC)", unit: "million/µL", low: 3.8, high: 5.2,
    aliases: [/\brbc\b(?!\s*indices)/i, /\bred\s+blood\s+cell(s)?(\s+count)?\b/i, /\berythrocyte(s)?(\s+count)?\b/i],
    lowNote: "A low red cell count often goes together with low haemoglobin (anaemia).",
    highNote: "A high red cell count can be due to dehydration or other causes.",
  },
  {
    key: "wbc", name: "White blood cells (WBC)", unit: "/µL", low: 4000, high: 11000,
    aliases: [/\bwbc\b/i, /\btotal\s+(leu[ck]ocyte|wbc)\s+count\b/i, /\btlc\b/i, /\bwhite\s+blood\s+cell(s)?(\s+count)?\b/i, /\bleu[ck]ocyte(s)?\b/i],
    scale: (v) => (v < 100 ? v * 1000 : v), // reports often write 7.5 (x10³)
    lowNote: "Low white cells can follow viral infections or some medicines; your doctor may repeat the test.",
    highNote: "High white cells often mean the body is fighting an infection or inflammation.",
  },
  {
    key: "plt", name: "Platelets", unit: "/µL", low: 150000, high: 450000,
    aliases: [/\bplatelet(s)?(\s+count)?\b/i, /\bplt\b/i],
    scale: (v) => (v < 2000 ? v * 1000 : v), // 250 (x10³) or 2.5 lakh
    lowNote: "Low platelets can make bruising or bleeding easier – worth discussing with your doctor.",
    highNote: "High platelets can be a reaction to infection, inflammation or low iron.",
  },
  {
    key: "hct", name: "Haematocrit (PCV)", unit: "%", low: 36, high: 46,
    aliases: [/\bh(a)?ematocrit\b/i, /\bpcv\b/i, /\bhct\b/i, /\bpacked\s+cell\s+volume\b/i],
    lowNote: "A low haematocrit usually goes with anaemia.",
    highNote: "A high haematocrit is often due to dehydration.",
  },
  {
    key: "mcv", name: "MCV (red cell size)", unit: "fL", low: 80, high: 100,
    aliases: [/\bmcv\b/i, /\bmean\s+corpuscular\s+volume\b/i],
    lowNote: "Small red cells (low MCV) are typical of iron deficiency.",
    highNote: "Large red cells (high MCV) can be linked to low vitamin B12 or folate.",
  },
  {
    key: "tsh", name: "TSH (thyroid)", unit: "mIU/L", low: 0.4, high: 4.0,
    aliases: [/\btsh\b/i, /\bthyroid\s+stimulating\s+hormone\b/i],
    lowNote: "Low TSH can mean an overactive thyroid (hyperthyroidism): weight loss, fast heartbeat, anxiety, lighter periods.",
    highNote: "High TSH often means an underactive thyroid (hypothyroidism): tiredness, weight gain, feeling cold, heavier or irregular periods.",
  },
  {
    key: "ft4", name: "Free T4", unit: "ng/dL", low: 0.8, high: 1.8,
    aliases: [/\bfree\s*t4\b/i, /\bft4\b/i, /\bfree\s+thyroxine\b/i],
    lowNote: "Low free T4 together with high TSH suggests an underactive thyroid.",
    highNote: "High free T4 can point to an overactive thyroid.",
  },
  {
    key: "t4", name: "Total T4", unit: "µg/dL", low: 5, high: 12,
    aliases: [/\b(total\s+)?t4\b(?!\s*free)/i, /\bthyroxine\b/i],
    exclude: /\bfree\b|\bft4\b/i,
    lowNote: "Low T4 can mean an underactive thyroid.",
    highNote: "High T4 can mean an overactive thyroid (or can rise in pregnancy / with the pill).",
  },
  {
    key: "t3", name: "Total T3", unit: "ng/dL", low: 80, high: 200,
    aliases: [/\b(total\s+)?t3\b/i, /\btriiodothyronine\b/i],
    exclude: /\bfree\b|\bft3\b/i,
    lowNote: "Low T3 can be seen with an underactive thyroid or during illness.",
    highNote: "High T3 can be seen with an overactive thyroid.",
  },
  {
    key: "vitd", name: "Vitamin D", unit: "ng/mL", low: 30, high: 100,
    aliases: [/\bvit(amin)?\.?\s*d\s*3?\b/i, /\b25\s*oh\s*d\b/i],
    lowNote: "Low vitamin D is very common. It can cause tiredness, low mood and aches; supplements and sunlight usually help – ask your doctor about a dose.",
    highNote: "Very high vitamin D usually comes from taking too many supplements.",
  },
  {
    key: "b12", name: "Vitamin B12", unit: "pg/mL", low: 200, high: 900,
    aliases: [/\bvit(amin)?\.?\s*b\s*12\b/i, /\bcobalamin\b/i],
    lowNote: "Low B12 can cause tiredness, tingling in hands/feet and poor concentration. It's common in vegetarian diets.",
    highNote: "High B12 is usually from supplements and is rarely a concern on its own.",
  },
  {
    key: "ferritin", name: "Ferritin (iron stores)", unit: "ng/mL", low: 15, high: 150,
    aliases: [/\bferritin\b/i],
    lowNote: "Low ferritin means your iron stores are low – common with heavy periods. It can cause tiredness and hair fall even before anaemia shows.",
    highNote: "High ferritin can be raised by inflammation or infection, and occasionally iron overload.",
  },
  {
    key: "iron", name: "Serum iron", unit: "µg/dL", low: 60, high: 170,
    aliases: [/\bserum\s+iron\b/i, /^\s*iron\b/i],
    lowNote: "Low serum iron suggests iron deficiency.",
    highNote: "High serum iron can follow supplements; your doctor will read it with ferritin.",
  },
  {
    key: "fbs", name: "Fasting blood sugar", unit: "mg/dL", low: 70, high: 99,
    aliases: [/\bfasting\s+(blood\s+|plasma\s+)?(sugar|glucose)\b/i, /\bfbs\b/i, /\bfpg\b/i],
    lowNote: "Low fasting sugar can cause shakiness, sweating or faintness.",
    highNote: "Fasting sugar of 100–125 is 'prediabetes' range and 126+ may suggest diabetes – PCOS increases this risk, so it's worth discussing.",
  },
  {
    key: "ppbs", name: "Post-meal blood sugar", unit: "mg/dL", low: 70, high: 140,
    aliases: [/\bpp(bs|bg)\b/i, /\bpost\s*-?\s*prandial\b/i],
    lowNote: "Low after-meal sugar is uncommon; mention it if you feel faint after meals.",
    highNote: "High after-meal sugar can be an early sign of insulin resistance or diabetes.",
  },
  {
    key: "hba1c", name: "HbA1c (3-month sugar average)", unit: "%", low: 4, high: 5.6,
    aliases: [/\bhba\s*1\s*c\b/i, /\bglycated\s+h(a)?emoglobin\b/i, /\bglycosylated\s+h(a)?emoglobin\b/i],
    lowNote: "A low HbA1c is uncommon and can happen with some blood conditions.",
    highNote: "HbA1c of 5.7–6.4% is 'prediabetes' range and 6.5%+ may suggest diabetes.",
  },
  {
    key: "chol", name: "Total cholesterol", unit: "mg/dL", low: null, high: 200,
    aliases: [/\btotal\s+cholesterol\b/i, /^\s*cholesterol\b/i, /\bs\.?\s*cholesterol\b/i],
    highNote: "High cholesterol raises heart risk over time; diet, activity and sometimes medicine help.",
  },
  {
    key: "ldl", name: "LDL ('bad') cholesterol", unit: "mg/dL", low: null, high: 130,
    aliases: [/\bldl\b/i],
    highNote: "High LDL raises heart risk over time.",
  },
  {
    key: "hdl", name: "HDL ('good') cholesterol", unit: "mg/dL", low: 50, high: null,
    aliases: [/\bhdl\b/i],
    lowNote: "Low HDL is linked to higher heart risk; exercise usually raises it.",
  },
  {
    key: "tg", name: "Triglycerides", unit: "mg/dL", low: null, high: 150,
    aliases: [/\btriglyceride(s)?\b/i, /\btg\b/i],
    highNote: "High triglycerides are often linked to sugar/refined-carb intake and insulin resistance (common with PCOS).",
  },
  {
    key: "creat", name: "Creatinine (kidney)", unit: "mg/dL", low: 0.5, high: 1.1,
    aliases: [/\bcreatinine\b(?!\s*clearance)/i],
    lowNote: "Low creatinine is usually not a concern (lower muscle mass).",
    highNote: "High creatinine can mean the kidneys need a closer look, or dehydration.",
  },
  {
    key: "calcium", name: "Calcium", unit: "mg/dL", low: 8.6, high: 10.3,
    aliases: [/\bcalcium\b/i],
    lowNote: "Low calcium is often linked to low vitamin D.",
    highNote: "High calcium should be checked by a doctor.",
  },
  {
    key: "prl", name: "Prolactin", unit: "ng/mL", low: 4.8, high: 23.3,
    aliases: [/\bprolactin\b/i, /\bprl\b/i],
    lowNote: "Low prolactin is rarely a concern.",
    highNote: "High prolactin can cause irregular or missed periods and milky nipple discharge; stress and some medicines can raise it.",
  },
  {
    key: "fsh", name: "FSH", unit: "mIU/mL", low: 3.5, high: 12.5,
    aliases: [/\bfsh\b/i, /\bfollicle\s+stimulating\s+hormone\b/i],
    phaseDependent: true,
    lowNote: "FSH changes through the cycle; your doctor reads it with the day of your cycle.",
    highNote: "High FSH (especially on cycle day 2–5) can relate to lower ovarian reserve or approaching menopause.",
  },
  {
    key: "lh", name: "LH", unit: "mIU/mL", low: 2.4, high: 12.6,
    aliases: [/\blh\b/i, /\bluteini[sz]ing\s+hormone\b/i],
    phaseDependent: true,
    lowNote: "LH changes through the cycle; your doctor reads it with the day of your cycle.",
    highNote: "LH is normally high around ovulation. A high LH-to-FSH ratio outside that is sometimes seen in PCOS.",
  },
  {
    key: "testo", name: "Testosterone (total)", unit: "ng/dL", low: 15, high: 70,
    aliases: [/\b(total\s+)?testosterone\b/i],
    exclude: /\bfree\b/i,
    lowNote: "Low testosterone in women is usually not a concern on its own.",
    highNote: "Raised testosterone in women can cause acne, extra hair growth and irregular periods – it's one of the things doctors check for PCOS.",
  },
];

/* ------------------------------------------------------------------ */
/* 3) Parse a line: value + (optional) printed reference range          */
/* ------------------------------------------------------------------ */

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const RANGE_RE = new RegExp(String.raw`(${NUM})\s*(?:-|–|—|to)\s*(${NUM})`);
const toNum = (s) => parseFloat(String(s).replace(/,(?=\d{3}\b)/g, "").replace(",", "."));

function cleanLine(line) {
  return line
    .replace(/\(?\b25\s*[-(]?\s*(oh|hydroxy)\s*\)?/gi, " ") // "25-OH Vitamin D": the 25 is not the value
    .replace(/(\d),(\d{3})\b/g, "$1$2") // 2,50,000 / 250,000 -> no thousands commas
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/[|]/g, " ");
}

function readLine(test, rawLine) {
  const line = cleanLine(rawLine);
  if (test.exclude && test.exclude.test(line)) return null;
  let m = null;
  for (const re of test.aliases) {
    m = line.match(re);
    if (m) break;
  }
  if (!m) return null;

  const rest = line.slice(m.index + m[0].length);
  // Printed range like "12.0 - 15.5" (taken out before reading the value)
  const range = rest.match(RANGE_RE);
  const beforeRange = range ? rest.slice(0, range.index) + " " + rest.slice(range.index + range[0].length) : rest;
  const valueMatch = beforeRange.match(new RegExp(`(?<![\\d.])(${NUM})`));
  if (!valueMatch) return null;

  let value = toNum(valueMatch[1]);
  if (!Number.isFinite(value)) return null;

  // Unit written right after the value, e.g. "10.2 g/dL" -> "g/dL"
  const after = beforeRange.slice(valueMatch.index + valueMatch[0].length);
  const unitMatch = after.match(/^\s*([a-zA-Zµμ%][\w/%µμ^.*]*)/);
  const unitOnReport =
    unitMatch && !/^(h|l|high|low)$/i.test(unitMatch[1]) ? unitMatch[1] : "";

  let low = test.low;
  let high = test.high;
  let rangeSource = "typical";
  if (range) {
    const a = toNum(range[1]);
    const b = toNum(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a < b) {
      low = a;
      high = b;
      rangeSource = "report";
    }
  }
  // Unit scaling only when comparing with our own typical range
  if (rangeSource === "typical" && test.scale) {
    if (/\blakhs?\b/i.test(line)) value = value * 100000; // "2.5 lakh" (common in Indian reports)
    else value = test.scale(value);
  }

  let status = "normal";
  if (low != null && value < low) status = "low";
  else if (high != null && value > high) status = "high";

  return { value, low, high, rangeSource, status, unitOnReport };
}

function fmt(n) {
  if (n == null) return null;
  return Number.isInteger(n) ? n.toLocaleString("en-IN") : String(n);
}

function rangeText(f) {
  if (f.low != null && f.high != null) return `${fmt(f.low)}–${fmt(f.high)}`;
  if (f.high != null) return `below ${fmt(f.high)}`;
  return `above ${fmt(f.low)}`;
}

/**
 * Find known tests in report text.
 * Returns { findings: [...], explanation: "readable text" }
 */
function analyzeReportText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const findings = [];
  const seen = new Set();

  for (const test of TESTS) {
    for (const line of lines) {
      if (seen.has(test.key)) break;
      const r = readLine(test, line);
      if (!r) continue;
      seen.add(test.key);
      const note =
        r.status === "low" ? test.lowNote : r.status === "high" ? test.highNote : null;
      findings.push({
        key: test.key,
        name: test.name,
        value: r.value,
        // Scaled values (7.8 -> 7800) use our unit; otherwise prefer the unit on the report
        unit:
          r.rangeSource === "typical" && test.scale ? test.unit : r.unitOnReport || test.unit,
        low: r.low,
        high: r.high,
        range: rangeText(r),
        rangeSource: r.rangeSource,
        status: r.status,
        phaseDependent: !!test.phaseDependent,
        note: note || null,
      });
    }
  }

  // Out-of-range first, so the important ones are at the top
  const order = { high: 0, low: 0, normal: 1 };
  findings.sort((a, b) => order[a.status] - order[b.status]);

  return { findings, explanation: buildExplanation(findings) };
}

function buildExplanation(findings) {
  if (findings.length === 0) {
    return (
      "I couldn't recognise any common test values in this report.\n\n" +
      "This reader understands blood tests like haemoglobin, thyroid (TSH, T3, T4), vitamin D, B12, iron/ferritin, sugar (fasting, HbA1c), cholesterol and some hormones (FSH, LH, prolactin, testosterone). " +
      "Scans like ultrasound reports are written in sentences, so please read the 'Impression' section with your doctor.\n\n" +
      "Tip: a clear, straight photo in good light works best."
    );
  }

  const flagged = findings.filter((f) => f.status !== "normal");
  const lines = [];
  lines.push(
    flagged.length
      ? `I found ${findings.length} test value${findings.length > 1 ? "s" : ""}. ${flagged.length} ${flagged.length > 1 ? "are" : "is"} outside the usual range:`
      : `I found ${findings.length} test value${findings.length > 1 ? "s" : ""}, and all of them are within the usual range. 🌿`
  );
  lines.push("");

  for (const f of findings) {
    const icon = f.status === "normal" ? "✅" : "⚠️";
    const label = f.status === "normal" ? "within range" : f.status.toUpperCase();
    lines.push(`${icon} ${f.name}: ${fmt(f.value)}${f.unit ? " " + f.unit : ""} – ${label} (usual: ${f.range}${f.rangeSource === "report" ? ", from your report" : ""})`);
    if (f.note) lines.push(`   ${f.note}`);
    if (f.phaseDependent && f.status !== "normal") lines.push("   (This hormone depends on your cycle day.)");
  }

  lines.push("");
  lines.push(
    "This is an automatic reading to help you understand the words and numbers – it is not a diagnosis. " +
      "Please double-check the values against your report and discuss anything flagged with your doctor."
  );
  return lines.join("\n");
}

module.exports = { extractText, analyzeReportText, TESTS };
