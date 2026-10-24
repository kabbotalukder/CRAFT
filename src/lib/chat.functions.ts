import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "model"]),
  text: z.string().min(1),
});

export const chatWithGemma = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        messages: z.array(messageSchema).min(1).max(100),
        context: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey =
      process.env["AI_API_KEY"] ??
      process.env["GEMINI_API_KEY"] ??
      process.env["GOOGLE_API_KEY"];
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

    const model = process.env["AI_MODEL"] ?? "gemini-2.5-flash";
    const systemPrompt = data.context
      ? `You are CRAFT, an expert academic tutor and AI study assistant. The student is reviewing a specific study resource and asking follow-up questions.\n\nSTUDY RESOURCE CONTEXT:\n${data.context.slice(0, 10000)}\n\nINSTRUCTIONS:\n- Answer questions accurately using the resource context whenever relevant.\n- Provide clear, direct explanations with examples or bullet points where helpful.\n- If the student asks something outside this resource, answer helpfully while noting how it connects.\n- Format responses with clean Markdown (bold text, bullet points, code blocks where appropriate).\n- Keep answers concise, engaging, and directly applicable to student exams.`
      : "You are CRAFT, a thoughtful, precise AI study assistant. Give clear, well-structured answers. Be warm but concise. Format responses with clean Markdown.";

    const baseUrl = process.env["AI_BASE_URL"];
    if (baseUrl) {
      const openAiMessages = [
        { role: "system", content: systemPrompt },
        ...data.messages.map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.text,
        })),
      ];
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: openAiMessages,
          temperature: 0.6,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`AI request failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) throw new Error("AI returned an empty response");
      return { text };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: data.messages.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI request failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";
    if (!text) throw new Error("AI returned an empty response");
    return { text };
  });

// Firebase web config values are publishable by design, but the API key is
// stored as a project secret, so the client fetches the config at runtime.
export const getFirebaseConfig = createServerFn({ method: "GET" }).handler(
  async () => {
    const apiKey = process.env["GOOGLE_API_KEY"];
    if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");
    return {
      apiKey,
      authDomain: "craft-42477.firebaseapp.com",
      projectId: "craft-42477",
      storageBucket: "craft-42477.firebasestorage.app",
      messagingSenderId: "1075043071769",
      appId: "1:1075043071769:web:93cc798be387e257f23788",
    };
  },
);
