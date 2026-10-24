import type { ExamTag } from "@/lib/constants";
import type { CtEntry } from "@/lib/forecast";

export interface Course {
  id: string;
  code: string;
  title: string;
  credit: number;
  attendance: number | null;
  ctEntries: CtEntry[];
  mid: number | null;
  final: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Resource {
  id: string;
  title: string;
  type: "text" | "photo";
  examTag: ExamTag;
  content: string | null;
  extractedText: string | null;
  summary: string | null;
  summaryGeneratedAt: number | null;
  summaryModel: string | null;
  imageCount: number;
  images?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceResourceId: string;
}

export interface Quiz {
  id: string;
  questions: QuizQuestion[];
  difficulty: string;
  examTags: ExamTag[];
  resourceIds: string[];
  createdAt: number;
}

export interface Attempt {
  id: string;
  quizId: string;
  answers: number[]; // chosen option index per question
  correctAnswers?: number[];
  questionResources?: string[];
  score: number;
  total: number;
  perResource: Record<string, { correct: number; total: number }>;
  examTags: ExamTag[];
  difficulty: string;
  createdAt: number;
}
