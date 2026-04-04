import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL_ID, GEMINI_SYSTEM_PROMPTS, DEFAULT_REWRITE_INSTRUCTION } from "./constants";
import type { RAGResult } from "./rag-types";
import { formatRAGContext } from "./prompt-builder";
import type { LanguageDirection } from "@/types";

let genAI: GoogleGenerativeAI | null = null;

/**
 * Initialize the Gemini client with the user's API key.
 * Called when the user enters a key in Settings.
 */
export function initGemini(apiKey: string): void {
  genAI = new GoogleGenerativeAI(apiKey);
  console.log("[RDAT-Gemini] Client initialized");
}

/**
 * Check if Gemini is ready (has a valid API key set).
 */
export function isGeminiReady(): boolean {
  return genAI !== null;
}

/**
 * Get the current API key (for display purposes, masked).
 * Returns null if not initialized.
 */
export function getGeminiApiKey(): string | null {
  return genAI ? "configured" : null;
}

/**
 * rewriteText — Send text to Gemini for rewriting/synthesis.
 * Uses the cloud Reasoning Track for heavier tasks.
 *
 * @param text The selected text from the editor
 * @param ragResults Top RAG matches for context
 * @param direction The current language direction
 * @param instruction Optional custom instruction
 * @returns The rewritten text, or null on failure
 */
export async function rewriteText(
  text: string,
  ragResults: RAGResult[] = [],
  direction: LanguageDirection = "en-ar",
  instruction?: string
): Promise<string | null> {
  if (!genAI) {
    console.error("[RDAT-Gemini] Not initialized — call initGemini() first");
    return null;
  }

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_ID });
  const systemPrompt = GEMINI_SYSTEM_PROMPTS[direction];
  const defaultInstruction = DEFAULT_REWRITE_INSTRUCTION[direction];

  // Build context with RAG
  const ragContext = formatRAGContext(ragResults, direction);
  const userMessage = ragContext
    ? `${ragContext}\n\nText to rewrite:\n${text}\n\nInstruction: ${instruction || defaultInstruction}`
    : `Text to rewrite:\n${text}\n\nInstruction: ${instruction || defaultInstruction}`;

  try {
    console.log(`[RDAT-Gemini] Sending rewrite request (${text.length} chars, direction: ${direction})`);

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: userMessage }] },
      ],
      systemInstruction: { role: "model", parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    const response = result.response;
    const rewritten = response.text();

    if (rewritten && rewritten.trim().length > 0) {
      console.log(`[RDAT-Gemini] Rewrite complete (${rewritten.length} chars)`);
      return rewritten.trim();
    }

    console.warn("[RDAT-Gemini] Empty response from Gemini");
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[RDAT-Gemini] Rewrite failed: ${msg}`);
    return null;
  }
}

/**
 * Dispose the Gemini client (on key change or logout).
 */
export function disposeGemini(): void {
  genAI = null;
  console.log("[RDAT-Gemini] Client disposed");
}
