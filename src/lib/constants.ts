// Fixed mark distribution for every course. Change here only.
export const MARKS = {
  attendance: 10,
  ct: 10,
  mid: 30,
  final: 50,
  total: 100,
} as const;

export type ExamTag = "mid" | "final";
export const EXAM_TAGS: ExamTag[] = ["mid", "final"];

export interface GradeRow {
  min: number;
  letter: string;
  point: number;
}

// Configurable grading table (descending thresholds).
export const GRADE_TABLE: GradeRow[] = [
  { min: 80, letter: "A+", point: 4.0 },
  { min: 75, letter: "A", point: 3.75 },
  { min: 70, letter: "A-", point: 3.5 },
  { min: 65, letter: "B+", point: 3.25 },
  { min: 60, letter: "B", point: 3.0 },
  { min: 55, letter: "B-", point: 2.75 },
  { min: 50, letter: "C+", point: 2.5 },
  { min: 45, letter: "C", point: 2.25 },
  { min: 40, letter: "D", point: 2.0 },
  { min: 0, letter: "F", point: 0.0 },
];

export function gradeFor(total: number): GradeRow {
  for (const row of GRADE_TABLE) {
    if (total >= row.min) return row;
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return GRADE_TABLE[GRADE_TABLE.length - 1]!;
}
