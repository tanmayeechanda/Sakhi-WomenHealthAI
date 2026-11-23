// backend/utils/cycle.js
// One place for all cycle maths, used by the API, the tracker and the assistant.
//
// Period entries can be either:
//   - one entry per logged day (what the tracker calendar creates), or
//   - one entry with a startDate and an endDate.
// So we first group nearby days into "periods", then learn the user's own
// average cycle length from the gaps between period starts.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE = 28;
const DEFAULT_PERIOD_LENGTH = 5;
const MIN_CYCLE = 18; // gaps outside this range are treated as missed logs / noise
const MAX_CYCLE = 50;
const MAX_CYCLES_FOR_AVERAGE = 6; // only the most recent cycles count

// Midnight of the given date (local time), so "days between" ignores hours
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

function addDays(d, n) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Group entries into periods: logged days at most 2 days apart belong
 * to the same period. Returns [{ start, end }] sorted oldest -> newest.
 */
function groupPeriods(entries) {
  const days = [];
  for (const e of entries || []) {
    if (!e || !e.startDate) continue;
    const start = startOfDay(e.startDate);
    const end = e.endDate ? startOfDay(e.endDate) : start;
    days.push({ start, end: end < start ? start : end });
  }
  days.sort((a, b) => a.start - b.start);

  const periods = [];
  for (const d of days) {
    const last = periods[periods.length - 1];
    if (last && daysBetween(last.end, d.start) <= 2) {
      if (d.end > last.end) last.end = d.end;
    } else {
      periods.push({ start: d.start, end: d.end });
    }
  }
  return periods;
}

/**
 * Work out where the user is in her cycle.
 * `phase` keeps the vocabulary the rest of the app already uses:
 *   "period" | "follicular" | "ovulation" | "luteal" | "unknown"
 */
function getCycleStats(entries, today = new Date()) {
  const periods = groupPeriods(entries).filter((p) => p.start <= startOfDay(today));
  if (periods.length === 0) {
    return {
      phase: "unknown",
      phaseLabel: "Not enough data",
      season: null,
      dayOfCycle: null,
      daysSinceStart: null,
      avgCycleLength: DEFAULT_CYCLE,
      avgPeriodLength: DEFAULT_PERIOD_LENGTH,
      cyclesUsed: 0,
      isPersonalised: false,
      lastPeriodStart: null,
      nextPeriodDate: null,
      daysUntilNextPeriod: null,
      fertileWindow: null,
      isLate: false,
      daysLate: 0,
    };
  }

  // Cycle lengths = gaps between consecutive period starts (recent ones only)
  const gaps = [];
  for (let i = 1; i < periods.length; i++) {
    const gap = daysBetween(periods[i - 1].start, periods[i].start);
    if (gap >= MIN_CYCLE && gap <= MAX_CYCLE) gaps.push(gap);
  }
  const recentGaps = gaps.slice(-MAX_CYCLES_FOR_AVERAGE);
  const avgCycleLength = recentGaps.length
    ? Math.round(recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length)
    : DEFAULT_CYCLE;

  // Average bleed length from periods that span more than one day
  const lengths = periods
    .map((p) => daysBetween(p.start, p.end) + 1)
    .filter((n) => n >= 2 && n <= 10)
    .slice(-MAX_CYCLES_FOR_AVERAGE);
  const avgPeriodLength = lengths.length
    ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    : DEFAULT_PERIOD_LENGTH;

  const last = periods[periods.length - 1];
  const dayOfCycle = daysBetween(last.start, today) + 1; // day 1 = first day of period

  // Ovulation usually happens ~14 days BEFORE the next period
  const ovulationDay = Math.max(avgCycleLength - 14, avgPeriodLength + 1);
  const nextPeriodDate = addDays(last.start, avgCycleLength);
  const daysUntilNextPeriod = daysBetween(today, nextPeriodDate);
  const isLate = dayOfCycle > avgCycleLength;

  let phase;
  let phaseLabel;
  let season;
  const currentPeriodLength = Math.max(daysBetween(last.start, last.end) + 1, 1);
  const stillBleeding = dayOfCycle <= Math.max(avgPeriodLength, currentPeriodLength);

  if (stillBleeding) {
    phase = "period";
    phaseLabel = "Menstrual phase";
    season = "Winter";
  } else if (dayOfCycle < ovulationDay - 1) {
    phase = "follicular";
    phaseLabel = "Follicular phase";
    season = "Spring";
  } else if (dayOfCycle <= ovulationDay + 1) {
    phase = "ovulation";
    phaseLabel = "Ovulation";
    season = "Summer";
  } else {
    phase = "luteal";
    phaseLabel = isLate ? "Period expected (late)" : "Luteal phase";
    season = "Autumn";
  }

  return {
    phase,
    phaseLabel,
    season,
    dayOfCycle,
    daysSinceStart: dayOfCycle, // kept for older callers
    avgCycleLength,
    avgPeriodLength,
    cyclesUsed: recentGaps.length,
    isPersonalised: recentGaps.length > 0,
    lastPeriodStart: last.start,
    nextPeriodDate: isLate ? null : nextPeriodDate,
    daysUntilNextPeriod: isLate ? null : daysUntilNextPeriod,
    fertileWindow: {
      start: addDays(last.start, ovulationDay - 6), // ~5 days before ovulation
      end: addDays(last.start, ovulationDay),
    },
    isLate,
    daysLate: isLate ? dayOfCycle - avgCycleLength : 0,
  };
}

module.exports = { groupPeriods, getCycleStats, startOfDay, daysBetween, addDays };
