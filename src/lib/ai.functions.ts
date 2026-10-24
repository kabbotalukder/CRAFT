import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

// ---------------------------------------------------------------------------
// StudyPilot `ai` backend.
// Verifies the caller's Firebase ID token (Bearer) against Google's
// securetoken JWKS, validates input with Zod, rate-limits per user, and
// calls the configured AI provider (default: Gemma via the Gemini API;
// any OpenAI-compatible endpoint via AI_BASE_URL).
// ---------------------------------------------------------------------------

const FIREBASE_PROJECT_ID = "craft-42477";
const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com",
  ),
);

async function verifyFirebaseToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  if (!payload.sub) throw new Error("Token has no subject");
  return payload.sub;
}

// Simple in-memory per-user rate limiting (best effort per isolate).
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(uid: string, limit = 20, windowMs = 60_000): void {
  const now = Date.now();
  const b = buckets.get(uid);
  if (!b || b.resetAt < now) {
    buckets.set(uid, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    throw new Error("Too many requests — please wait a minute and try again.");
  }
}

// ---------- Provider adapter ----------

interface ChatMessage {
  role: "user" | "model";
  text?: string;
  images?: string[]; // base64 JPEG data (no data: prefix)
}

async function callModel(messages: ChatMessage[]): Promise<string> {
  const apiKey =
    process.env["AI_API_KEY"] ??
    process.env["GEMINI_API_KEY"] ??
    process.env["GOOGLE_API_KEY"];
  if (!apiKey) throw new Error("AI_API_KEY is not configured");
  const model = process.env["AI_MODEL"] ?? "gemini-2.5-flash";
  const baseUrl = process.env["AI_BASE_URL"];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    if (baseUrl) {
      // OpenAI-compatible endpoint (Ollama, OpenRouter, vLLM, …)
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({
            role: m.role === "model" ? "assistant" : "user",
            content:
              m.images && m.images.length > 0
                ? [
                    { type: "text", text: m.text ?? "" },
                    ...m.images.map((img) => ({
                      type: "image_url",
                      image_url: { url: `data:image/jpeg;base64,${img}` },
                    })),
                  ]
                : (m.text ?? ""),
          })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("AI Request Failed:", res.status, errBody);
        throw new Error(`AI request failed (${res.status}): ${errBody.slice(0, 150)}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) throw new Error("The AI returned an empty response");
      return text;
    }

    // Default: Google AI Studio / Gemini API.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: messages.map((m) => ({
          role: m.role,
          parts: [
            ...(m.text ? [{ text: m.text }] : []),
            ...(m.images ?? []).map((img) => ({
              inline_data: { mime_type: "image/jpeg", data: img },
            })),
          ],
        })),
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("AI Request Failed:", res.status, errBody);
      throw new Error(`AI request failed (${res.status}): ${errBody.slice(0, 150)}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";
    if (!text) throw new Error("The AI returned an empty response");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Summarize ----------

const SUMMARY_RULES = `You are creating a comprehensive, study-grade digest of course material for a university student.
Rules:
- Length: roughly 25-40% of the source, minimum ~200 words for non-trivial sources. Never drop key facts to save space.
- Capture EVERY important concept, definition, formula, rule, example, date, name, step and relationship. A quiz must be generatable from your summary alone.
- Output Markdown with: a one-line overview, headed sections, bullet facts, a "Key terms & definitions" section, a "Formulas / rules" section (when relevant), and a "Likely exam points" section.
- Never invent facts. If part of the source is unreadable, say so instead of guessing.`;

const CHUNK_SIZE = 7000;

async function summarizeText(text: string): Promise<string> {
  if (text.length <= CHUNK_SIZE) {
    return callModel([
      { role: "user", text: `${SUMMARY_RULES}\n\nSource material:\n${text}` },
    ]);
  }
  // Chunk, summarize each, then merge.
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  const partials: string[] = [];
  for (const [i, chunk] of chunks.entries()) {
    partials.push(
      await callModel([
        {
          role: "user",
          text: `${SUMMARY_RULES}\n\nThis is part ${i + 1} of ${chunks.length} of a longer source. Summarize this part fully:\n${chunk}`,
        },
      ]),
    );
  }
  return callModel([
    {
      role: "user",
      text: `${SUMMARY_RULES}\n\nMerge the following partial summaries of one source into ONE coherent summary without losing details:\n\n${partials.join("\n\n---\n\n")}`,
    },
  ]);
}

async function extractFromImages(images: string[]): Promise<string> {
  return callModel([
    {
      role: "user",
      text: `Transcribe all visible text from these study-note photos exactly, and describe any diagrams or figures in words. If an image is unreadable, say so instead of guessing. Output plain text only.`,
      images,
    },
  ]);
}

// ---------- Quiz generation ----------

const quizQuestionSchema = z.object({
  question: z.string().min(5),
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  sourceResourceId: z.string().min(1),
});

const quizOutputSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

async function generateQuiz(input: {
  summaries: { resourceId: string; title: string; examTag: string; summary: string }[];
  count: number;
  difficulty: string;
}): Promise<QuizQuestion[]> {
  const sourceList = input.summaries
    .map(
      (s) =>
        `### Resource "${s.title}" (id: ${s.resourceId}, exam: ${s.examTag})\n${s.summary}`,
    )
    .join("\n\n");
  const prompt = `You are generating a multiple-choice quiz for a university student, using ONLY the summaries below.

Requirements:
- Exactly ${input.count} questions. Difficulty: ${input.difficulty}.
- Each question has exactly 4 options, one correct answer (correctIndex 0-3), a short explanation, and the sourceResourceId of the resource it came from.
- Distribute questions proportionally across the resources. Avoid duplicates and trivially guessable questions.
- Return STRICT JSON only, no prose, no code fences, matching: {"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","sourceResourceId":"..."}]}

Summaries:
${sourceList}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callModel([
      {
        role: "user",
        text:
          attempt === 0
            ? prompt
            : `Your previous output was not valid JSON matching the required schema. Return ONLY the corrected strict JSON, no prose.\n\n${prompt}`,
      },
    ]);
    try {
      const parsed = quizOutputSchema.parse(
        JSON.parse(stripCodeFences(raw)),
      );
      return parsed.questions;
    } catch {
      if (attempt === 1) {
        throw new Error(
          "The AI produced an invalid quiz. Please try generating it again.",
        );
      }
    }
  }
  throw new Error("The AI produced an invalid quiz. Please try again.");
}

// ---------- Server function ----------

const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("summarize"),
    text: z.string().max(200_000).optional(),
    images: z.array(z.string().max(400_000)).max(8).optional(),
  }),
  z.object({
    action: z.literal("generate_quiz"),
    summaries: z
      .array(
        z.object({
          resourceId: z.string().min(1),
          title: z.string().min(1),
          examTag: z.enum(["mid", "final"]),
          summary: z.string().min(1).max(100_000),
        }),
      )
      .min(1)
      .max(30),
    count: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
    difficulty: z.enum(["Easy", "Medium", "Hard", "Mixed"]),
  }),
]);

export const ai = createServerFn({ method: "POST" })
  .validator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const authHeader = getRequestHeader("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Sign in required");
    let uid: string;
    try {
      uid = await verifyFirebaseToken(token);
    } catch {
      throw new Error("Your session expired — please sign in again.");
    }
    rateLimit(uid);

    if (data.action === "summarize") {
      if (data.images && data.images.length > 0) {
        const extractedText = await extractFromImages(data.images);
        const summary = await summarizeText(extractedText);
        return { summary, extractedText };
      }
      if (!data.text) throw new Error("Nothing to summarize");
      const summary = await summarizeText(data.text);
      return { summary, extractedText: null };
    }

    const questions = await generateQuiz(data);
    return { questions };
  });
