import { describe, expect, it } from "vitest";
import {
  computeConfidence,
  computeForecast,
  normalizeCt,
  resourceMastery,
} from "@/lib/forecast";

const NOW = 1_800_000_000_000;

describe("normalizeCt", () => {
  it("returns null with no entries", () => {
    expect(normalizeCt([])).toBeNull();
  });

  it("averages percentages and scales to 10", () => {
    // 8/10 = 80%, 15/20 = 75% → avg 77.5% → 7.75
    expect(
      normalizeCt([
        { obtained: 8, max: 10 },
        { obtained: 15, max: 20 },
      ]),
    ).toBeCloseTo(7.75);
  });
});

describe("resourceMastery", () => {
  it("returns null with no data", () => {
    expect(resourceMastery([], "r1", NOW)).toBeNull();
  });

  it("weighs recent attempts more", () => {
    const attempts = [
      {
        createdAt: NOW - 120 * 86_400_000, // old, weight ~0.0625
        questions: [{ resourceId: "r1", correct: false }],
      },
      {
        createdAt: NOW,
        questions: [{ resourceId: "r1", correct: true }],
      },
    ];
    const m = resourceMastery(attempts, "r1", NOW);
    expect(m).not.toBeNull();
    expect(m!).toBeGreaterThan(0.9);
  });
});

describe("computeConfidence", () => {
  const resources = [
    { id: "r1", examTag: "mid" as const },
    { id: "r2", examTag: "final" as const },
  ];

  it("reports insufficient data with fewer than 2 attempts", () => {
    const result = computeConfidence(
      [
        {
          createdAt: NOW,
          questions: [
            { resourceId: "r1", correct: true },
            { resourceId: "r1", correct: true },
            { resourceId: "r1", correct: true },
            { resourceId: "r1", correct: true },
            { resourceId: "r1", correct: true },
          ],
        },
      ],
      resources,
      NOW,
    );
    expect(result.status).toBe("insufficient");
  });

  it("scores perfect mastery with full coverage at 100", () => {
    const attempts = [0, 1].map((i) => ({
      createdAt: NOW - i * 86_400_000,
      questions: [
        { resourceId: "r1", correct: true },
        { resourceId: "r2", correct: true },
        { resourceId: "r1", correct: true },
      ],
    }));
    const result = computeConfidence(attempts, resources, NOW);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.score).toBe(100);
  });

  it("halves the achievable score when coverage is zero-weighted", () => {
    // Only r1 quizzed → coverage 0.5 → score = mastery * 0.75
    const attempts = [0, 1].map((i) => ({
      createdAt: NOW - i * 86_400_000,
      questions: [
        { resourceId: "r1", correct: true },
        { resourceId: "r1", correct: true },
        { resourceId: "r1", correct: true },
      ],
    }));
    const result = computeConfidence(attempts, resources, NOW);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.score).toBeGreaterThan(70);
      expect(result.score).toBeLessThan(80);
    }
  });
});

describe("computeForecast", () => {
  it("returns null when there is no data at all", () => {
    expect(
      computeForecast({
        attendance: null,
        ctEntries: [],
        mid: null,
        final: null,
        attempts: [],
        resources: [],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("works with attendance only", () => {
    const f = computeForecast({
      attendance: 9,
      ctEntries: [],
      mid: null,
      final: null,
      attempts: [],
      resources: [],
      now: NOW,
    });
    expect(f).not.toBeNull();
    expect(f!.total.expected).toBeCloseTo(9);
    expect(f!.grade).toBe("F");
  });

  it("uses the entered final directly and narrows the range", () => {
    const f = computeForecast({
      attendance: 10,
      ctEntries: [{ obtained: 9, max: 10 }],
      mid: 25,
      final: 40,
      attempts: [],
      resources: [],
      now: NOW,
    });
    expect(f!.total.expected).toBeCloseTo(84);
    expect(f!.total.low).toBeCloseTo(84);
    expect(f!.total.high).toBeCloseTo(84);
    expect(f!.grade).toBe("A+");
    expect(f!.gradePoint).toBe(4.0);
  });

  it("estimates Mid from quiz mastery when Mid mark is not entered", () => {
    const attempts = [0, 1].map((i) => ({
      createdAt: NOW - i * 86_400_000,
      questions: [
        { resourceId: "r1", correct: true },
        { resourceId: "r1", correct: false },
        { resourceId: "r1", correct: true },
      ],
    }));
    const f = computeForecast({
      attendance: 10,
      ctEntries: [],
      mid: null,
      final: null,
      attempts,
      resources: [{ id: "r1", examTag: "mid" }],
      now: NOW,
    });
    expect(f).not.toBeNull();
    expect(f!.midEstimated).toBe(true);
    // mastery ≈ 2/3 → mid ≈ 20
    expect(f!.mid!).toBeGreaterThan(15);
    expect(f!.mid!).toBeLessThan(25);
  });

  it("lists what is needed for the next grades", () => {
    const f = computeForecast({
      attendance: 10,
      ctEntries: [{ obtained: 8, max: 10 }],
      mid: 24,
      final: null,
      attempts: [],
      resources: [],
      now: NOW,
    });
    // known = 42, prior = 32/40 = 0.8 → expected final 40 → total 82 (A+)
    expect(f!.grade).toBe("A+");
    expect(f!.neededForNextGrades).toEqual([]);
  });
});
