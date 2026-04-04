import type { RAGResult } from "./rag-types";
import type { LanguageDirection } from "@/types";
import { SYSTEM_PROMPTS } from "./constants";

/**
 * getSystemPrompt — Returns the system prompt based on language direction.
 */
export function getSystemPrompt(direction: LanguageDirection): string {
  return SYSTEM_PROMPTS[direction];
}

/**
 * formatRAGContext — Formats RAG results into a string for the prompt context.
 * Swaps arrow direction based on language pair.
 */
export function formatRAGContext(
  results: RAGResult[],
  direction: LanguageDirection = "en-ar"
): string {
  if (!results || results.length === 0) return "";

  const isForward = direction === "en-ar";

  const entries = results
    .map((r, i) =>
      isForward
        ? `${i + 1}. "${r.en}" → "${r.ar}"${r.context ? ` (${r.context})` : ""}`
        : `${i + 1}. "${r.ar}" → "${r.en}"${r.context ? ` (${r.context})` : ""}`
    )
    .join("\n");

  return `Reference Translation Memory:\n${entries}`;
}

/**
 * buildMessages — Constructs the chat messages array for WebLLM.
 * System prompt + RAG context + current editor text.
 */
export function buildMessages(
  editorText: string,
  ragResults: RAGResult[],
  direction: LanguageDirection = "en-ar"
): Array<{ role: "system" | "user"; content: string }> {
  const systemPrompt = getSystemPrompt(direction);
  const ragContext = formatRAGContext(ragResults, direction);

  let userMessage = editorText.trim();

  if (ragContext) {
    userMessage = `${ragContext}\n\nCurrent text to complete:\n${userMessage}`;
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
}
