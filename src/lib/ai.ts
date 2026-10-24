import { getFirebaseAuth } from "@/lib/firebase";
import { ai } from "@/lib/ai.functions";

async function callAi<T>(data: Record<string, unknown>): Promise<T> {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");
  const token = await user.getIdToken();
  return (await ai({ data, headers: { authorization: `Bearer ${token}` } })) as T;
}

export interface SummarizeResult {
  summary: string;
  extractedText: string | null;
}

export function summarizeText(text: string): Promise<SummarizeResult> {
  return callAi<SummarizeResult>({ action: "summarize", text });
}

export function summarizeImages(images: string[]): Promise<SummarizeResult> {
  return callAi<SummarizeResult>({ action: "summarize", images });
}

export interface GeneratedQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceResourceId: string;
}

export function generateQuiz(input: {
  summaries: {
    resourceId: string;
    title: string;
    examTag: string;
    summary: string;
  }[];
  count: 5 | 10 | 15 | 20;
  difficulty: "Easy" | "Medium" | "Hard" | "Mixed";
}): Promise<{ questions: GeneratedQuestion[] }> {
  return callAi<{ questions: GeneratedQuestion[] }>({
    action: "generate_quiz",
    ...input,
  });
}
