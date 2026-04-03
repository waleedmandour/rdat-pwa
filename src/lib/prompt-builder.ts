import type { RAGResult } from "./rag-types";

/**
 * SYSTEM_PROMPT — Constrains the LLM to output only ghost text completions.
 * No commentary, no explanations — just the next few words.
 */
export const SYSTEM_PROMPT = `You are an English-Arabic co-writing translation assistant. You help translators by suggesting the next few words of their translation.

CRITICAL RULES:
1. Output ONLY the next few words to complete the user's current text.
2. Do NOT provide commentary, explanations, or translations of the full text.
3. Do NOT repeat what the user has already written.
4. Keep your suggestion to 3-15 words maximum.
5. If the text is in English, suggest the Arabic translation continuation.
6. If the text is in Arabic, suggest the Arabic continuation.
7. Match the tone and register of the surrounding text (legal, technical, formal).
8. Never output markdown, formatting, or code blocks.`;

/**
 * formatRAGContext — Formats RAG results into a string for the prompt context.
 */
export function formatRAGContext(results: RAGResult[]): string {
  if (!results || results.length === 0) return "";

  const entries = results
    .map((r, i) => `${i + 1}. "${r.en}" → "${r.ar}"${r.context ? ` (${r.context})` : ""}`)
    .join("\n");

  return `Reference Translation Memory:\n${entries}`;
}

/**
 * buildMessages — Constructs the chat messages array for WebLLM.
 * System prompt + RAG context + current editor text.
 */
export function buildMessages(
  editorText: string,
  ragResults: RAGResult[]
): Array<{ role: "system" | "user"; content: string }> {
  const ragContext = formatRAGContext(ragResults);

  let userMessage = editorText.trim();

  if (ragContext) {
    userMessage = `${ragContext}\n\nCurrent text to complete:\n${userMessage}`;
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
}
