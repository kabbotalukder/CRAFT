import { GRADE_TABLE, MARKS, gradeFor, type ExamTag } from "@/lib/constants";

// ---------- Types ----------

export interface CtEntry {
  obtained: number;
  max: number;
}

export interface ResourceInfo {
  id: string;
  examTag: ExamTag;
}

export interface AttemptQuestion {
  resourceId: string;
  correct: boolean;
}

export interface AttemptInfo {
  createdAt: number; // ms epoch
  questions: AttemptQuestion[];
}

export interface ConfidenceOk {
  status: "ok";
  score: number; // 0-100
  label: string;
  masteryByResource: Record<string, number>; // 0-1
  coverageMid: number; // 0-1
  coverageFinal: number; // 0-1
}

export interface ConfidenceInsufficient {
  status: "insufficient";
  reason: string;
  masteryByResource: Record<string, number>;
  coverageMid: number;
  coverageFinal: number;
}

export type ConfidenceResult = ConfidenceOk | ConfidenceInsufficient;

export interface ForecastResult {
  attendance: number | null;
  ct: number | null; // normalized to /10
  mid: number | null; // known or estimated
  midEstimated: boolean;
  final: { low: number; expected: number; high: number } | null;
  total: { low: number; expected: number; high: number };
  grade: string;
  gradePoint: number;
  neededForNextGrades: { grade: string; needed: number }[];
  tip: string | null;
}

// ---------- CT normalization ----------

/**
 * Normalize CT entries to the 10-mark weight using the average percentage
 * of all entries. Returns null when there are no entries.
 */
export function normalizeCt(entries: CtEntry[]): number | null {
  if (entries.length === 0) return null;
  const avgPct =
    entries.reduce((sum, e) => sum + (e.max > 0 ? e.obtained / e.max : 0), 0) /
    entries.length;
  return avgPct * MARKS.ct;
}

// ---------- Confidence ----------

const HALF_LIFE_DAYS = 30;

function decayWeight(attemptTime: number, now: number): number {
  const ageDays = Math.max(0, (now - attemptTime) / 86_400_000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/**
 * Recency-weighted average accuracy over all attempts' questions for one
 * resource. Newer attempts weigh more (exponential decay, 30-day half-life).
 * Returns null when the resource has no answered questions.
 */
export function resourceMastery(
  attempts: AttemptInfo[],
  resourceId: string,
  now: number,
): number | null {
  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const attempt of attempts) {
    const w = decayWeight(attempt.createdAt, now);
    for (const q of attempt.questions) {
      if (q.resourceId !== resourceId) continue;
      weightedTotal += w;
      if (q.correct) weightedCorrect += w;
    }
  }
  if (weightedTotal === 0) return null;
  return weightedCorrect / weightedTotal;
}

export function confidenceLabel(score: number): string {
  if (score < 40) return "Low";
  if (score < 60) return "Developing";
  if (score < 80) return "Good";
  return "Strong";
}

export function computeConfidence(
  attempts: AttemptInfo[],
  resources: ResourceInfo[],
  now: number,
): ConfidenceResult {
  const masteryByResource: Record<string, number> = {};
  for (const r of resources) {
    const m = resourceMastery(attempts, r.id, now);
    if (m !== null) masteryByResource[r.id] = m;
  }

  const coverageFor = (tag: ExamTag): number => {
    const tagged = resources.filter((r) => r.examTag === tag);
    if (tagged.length === 0) return 0;
    const quizzed = tagged.filter((r) => masteryByResource[r.id] !== undefined);
    return quizzed.length / tagged.length;
  };
  const coverageMid = coverageFor("mid");
  const coverageFinal = coverageFor("final");

  const totalAnswered = attempts.reduce((s, a) => s + a.questions.length, 0);
  if (attempts.length < 2 || totalAnswered < 5) {
    return {
      status: "insufficient",
      reason:
        "Not enough data yet. Take at least 2 quizzes (5+ questions total) so Craft can estimate your confidence.",
      masteryByResource,
      coverageMid,
      coverageFinal,
    };
  }

  const masteries = Object.values(masteryByResource);
  const avgMastery =
    masteries.length === 0
      ? 0
      : masteries.reduce((a, b) => a + b, 0) / masteries.length;
  // Coverage combines Mid and Final coverage; tags with no resources are ignored.
  const coverages: number[] = [];
  if (resources.some((r) => r.examTag === "mid")) coverages.push(coverageMid);
  if (resources.some((r) => r.examTag === "final"))
    coverages.push(coverageFinal);
  const coverage =
    coverages.length === 0
      ? 0
      : coverages.reduce((a, b) => a + b, 0) / coverages.length;

  const score = Math.round(avgMastery * (0.5 + 0.5 * coverage) * 100);
  return {
    status: "ok",
    score,
    label: confidenceLabel(score),
    masteryByResource,
    coverageMid,
    coverageFinal,
  };
}

// ---------- Forecast ----------

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function computeForecast(input: {
  attendance: number | null; // /10
  ctEntries: CtEntry[];
  mid: number | null; // /30
  final: number | null; // /50, overrides forecast when entered
  attempts: AttemptInfo[];
  resources: ResourceInfo[];
  now: number;
}): ForecastResult | null {
  const { attendance, ctEntries, mid, final, attempts, resources, now } = input;
  const ct = normalizeCt(ctEntries);

  const confidence = computeConfidence(attempts, resources, now);
  const masteryOf = (id: string): number | null =>
    confidence.masteryByResource[id] ?? null;

  const avgMasteryFor = (tag: ExamTag): number | null => {
    const vals = resources
      .filter((r) => r.examTag === tag)
      .map((r) => masteryOf(r.id))
      .filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const midMastery = avgMasteryFor("mid");
  const finalMastery = avgMasteryFor("final");

  // Known components
  let knownSum = 0;
  let hasAny = false;
  if (attendance !== null) {
    knownSum += attendance;
    hasAny = true;
  }
  if (ct !== null) {
    knownSum += ct;
    hasAny = true;
  }

  // Mid: known, or estimated from Mid-resource mastery when quizzed.
  let midValue: number | null = mid;
  let midEstimated = false;
  if (midValue === null && midMastery !== null) {
    midValue = MARKS.mid * midMastery;
    midEstimated = true;
  }
  if (midValue !== null) {
    knownSum += midValue;
    hasAny = true;
  }

  // Prior: performance ratio on entered components (Mid and CT).
  let prior: number | null = null;
  {
    let earned = 0;
    let possible = 0;
    if (ct !== null) {
      earned += ct;
      possible += MARKS.ct;
    }
    if (midValue !== null) {
      earned += midValue;
      possible += MARKS.mid;
    }
    if (possible > 0) prior = earned / possible;
  }

  // Predicted Final (/50)
  let finalRange: ForecastResult["final"] = null;
  if (final !== null) {
    finalRange = { low: final, expected: final, high: final };
    hasAny = true;
  } else {
    const finalCoverage =
      resources.some((r) => r.examTag === "final")
        ? confidence.coverageFinal
        : 0;
    let expectedRatio: number | null = null;
    if (finalMastery !== null && prior !== null) {
      expectedRatio =
        finalMastery * finalCoverage + prior * (1 - finalCoverage);
    } else if (finalMastery !== null) {
      expectedRatio = finalMastery;
    } else if (prior !== null) {
      expectedRatio = prior;
    }
    if (expectedRatio !== null) {
      hasAny = true;
      // Spread narrows as data and coverage grow.
      const dataFactor = clamp(attempts.length / 5, 0, 1);
      const spreadRatio = 0.25 * (1 - 0.6 * finalCoverage) * (1 - 0.4 * dataFactor);
      const expected = MARKS.final * expectedRatio;
      const spread = MARKS.final * spreadRatio;
      finalRange = {
        low: clamp(expected - spread, 0, MARKS.final),
        expected,
        high: clamp(expected + spread, 0, MARKS.final),
      };
    }
  }

  if (!hasAny && finalRange === null) return null;

  const finalLow = finalRange?.low ?? 0;
  const finalExpected = finalRange?.expected ?? 0;
  const finalHigh = finalRange?.high ?? 0;

  const total = {
    low: Math.round((knownSum + finalLow) * 10) / 10,
    expected: Math.round((knownSum + finalExpected) * 10) / 10,
    high: Math.round((knownSum + finalHigh) * 10) / 10,
  };
  const grade = gradeFor(total.expected);

  // What you need: minimum Final marks to reach each next grade threshold.
  const neededForNextGrades: { grade: string; needed: number }[] = [];
  if (final === null) {
    for (const row of GRADE_TABLE) {
      if (row.min <= total.expected) break;
      const needed = Math.ceil(row.min - knownSum);
      if (needed <= MARKS.final) {
        neededForNextGrades.push({ grade: row.letter, needed });
      }
    }
  }

  // Deterministic tip: name the lowest-mastery resource.
  let tip: string | null = null;
  const entries = Object.entries(confidence.masteryByResource);
  if (entries.length > 0) {
    entries.sort((a, b) => a[1] - b[1]);
    const first = entries[0];
    if (first) {
      const [lowestId, lowestMastery] = first;
      tip = `Focus on resource ${lowestId} — your mastery there is lowest (${Math.round(lowestMastery * 100)}%).`;
    }
  }

  return {
    attendance,
    ct,
    mid: midValue,
    midEstimated,
    final: finalRange,
    total,
    grade: grade.letter,
    gradePoint: grade.point,
    neededForNextGrades,
    tip,
  };
}
