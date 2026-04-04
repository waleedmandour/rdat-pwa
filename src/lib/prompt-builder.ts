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
 *
 * When ragResults is empty, returns "gtr" as false (zero-shot mode).
 */
export function buildMessages(
  editorText: string,
  ragResults: RAGResult[],
  direction: LanguageDirection = "en-ar",
  sourceSentence: string = ""
): { messages: Array<{ role: "system" | "user"; content: string }>; usedGTR: boolean } {
  // If RAG has results, use context-augmented prompt
  if (ragResults && ragResults.length > 0) {
    return {
      messages: buildContextAugmentedMessages(editorText, ragResults, direction, sourceSentence),
      usedGTR: true,
    };
  }

  // RAG = 0: use zero-shot fallback prompt
  return {
    messages: buildZeroShotMessages(editorText, direction, sourceSentence),
    usedGTR: false,
  };
}

/**
 * buildContextAugmentedMessages — Context-Augmented Prompt (GTR-assisted).
 *
 * Used when RAG results are available (ragResults.length > 0).
 * Enforces GTR terminology through translation memory references.
 */
function buildContextAugmentedMessages(
  editorText: string,
  ragResults: RAGResult[],
  direction: LanguageDirection,
  sourceSentence: string
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

/**
 * buildZeroShotMessages — Zero-Shot Translation Prompt (fallback).
 *
 * Used when RAG returns 0 matches. This is a leaner prompt that asks the
 * LLM to autocomplete the translation without any terminology database context.
 * The LLM relies purely on its pre-trained knowledge.
 */
function buildZeroShotMessages(
  editorText: string,
  direction: LanguageDirection,
  sourceSentence: string
): Array<{ role: "system" | "user"; content: string }> {
  const isForward = direction === "en-ar";
  const sourceLang = isForward ? "English" : "Arabic";
  const targetLang = isForward ? "Arabic" : "English";

  const systemPrompt = `You are an expert ${sourceLang}-${targetLang} translator providing real-time co-writing assistance. You receive a source sentence and the translator's current draft, and your task is to autocomplete the translation seamlessly.

CRITICAL RULES:
1. Output ONLY the next few words to complete the ${targetLang} translation draft.
2. Do NOT provide commentary, explanations, or full translations.
3. Do NOT repeat what the user has already written in the target draft.
4. Keep your suggestion to 3-15 words maximum.
5. Use the Source Sentence as the primary reference for meaning.
6. Match the tone and register of the surrounding text (formal, technical).
7. Maintain grammatical agreement with the existing draft.
8. Never output markdown, formatting, or code blocks.
9. If the draft contains a misspelled or incomplete word, complete or correct it naturally.`;

  // Build the user message
  let userMessage = "";

  // Section 1: Source Sentence
  if (sourceSentence && sourceSentence.trim().length > 0) {
    userMessage += `Source Sentence (${sourceLang}):\n${sourceSentence.trim()}\n\n`;
  }

  // Section 2: Current Target Draft
  userMessage += `Current Target Draft (${targetLang}):\n${editorText.trim()}\n\n`;

  // Section 3: Instruction
  userMessage += `Instruction: Autocomplete the translator's current ${targetLang} draft seamlessly. Provide only the next 3-15 words. If the last word is incomplete or misspelled, output the corrected version of that word followed by the continuation. Do NOT repeat what has already been written.`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
}
