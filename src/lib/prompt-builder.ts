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
 *
 * Updated for split-pane (CAT) architecture:
 *   1. System prompt — defines the co-writing assistant role
 *   2. Source Sentence — the active sentence from the SOURCE pane
 *   3. Relevant TM/Glossary — RAG results from source-driven search
 *   4. Current Target Draft — what the user has typed so far in the TARGET pane
 *   5. Instruction — explicit guidance for ghost text generation
 */
export function buildMessages(
  editorText: string,
  ragResults: RAGResult[],
  direction: LanguageDirection = "en-ar",
  sourceSentence: string = ""
): Array<{ role: "system" | "user"; content: string }> {
  const systemPrompt = getSystemPrompt(direction);
  const ragContext = formatRAGContext(ragResults, direction);

  // Build the user message with structured sections
  let userMessage = "";

  // Section 1: Source Sentence (from the source pane)
  if (sourceSentence && sourceSentence.trim().length > 0) {
    userMessage += `Source Sentence:\n${sourceSentence.trim()}\n\n`;
  }

  // Section 2: RAG Context (Translation Memory matches)
  if (ragContext) {
    userMessage += `${ragContext}\n\n`;
  }

  // Section 3: Current Target Draft
  userMessage += `Current Target Draft:\n${editorText.trim()}\n\n`;

  // Section 4: Explicit instruction
  userMessage += `Instruction: Provide only the next few words to complete the target draft. Output 3-15 words maximum. Do not repeat what has already been written.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
}
