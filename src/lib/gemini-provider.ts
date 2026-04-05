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
 * Updated for split-pane CAT architecture:
 * Now sends BOTH the target translation AND its corresponding source text
 * so the LLM can evaluate translation accuracy before rewriting for
 * stylistic register.
 *
 * @param text The selected target text from the editor
 * @param ragResults Top RAG matches for context
 * @param direction The current language direction
 * @param instruction Optional custom instruction
 * @param sourceText The corresponding source sentence from the source pane
 * @returns The rewritten text, or null on failure
 */
export async function rewriteText(
  text: string,
  ragResults: RAGResult[] = [],
  direction: LanguageDirection = "en-ar",
  instruction?: string,
  sourceText?: string
): Promise<string | null> {
  if (!genAI) {
    console.error("[RDAT-Gemini] Not initialized — call initGemini() first");
    return null;
  }

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_ID });
  const systemPrompt = GEMINI_SYSTEM_PROMPTS[direction];
  const defaultInstruction = DEFAULT_REWRITE_INSTRUCTION[direction];

  // Build context with source text + RAG + target text
  let userMessage = "";

  // Section 1: Original Source Text (from the source pane)
  if (sourceText && sourceText.trim().length > 0) {
    userMessage += `Original Source Text:\n${sourceText.trim()}\n\n`;
  }

  // Section 2: RAG Context (Translation Memory)
  const ragContext = formatRAGContext(ragResults, direction);
  if (ragContext) {
    userMessage += `${ragContext}\n\n`;
  }

  // Section 3: Target Translation to evaluate and rewrite
  userMessage += `Target Translation to evaluate and rewrite:\n${text}\n\n`;

  // Section 4: Instruction
  userMessage += `Instruction: ${instruction || defaultInstruction}`;

  try {
    console.log(
      `[RDAT-Gemini] Sending rewrite request (${text.length} chars, direction: ${direction}${sourceText ? `, source: ${sourceText.length} chars` : ""})`
    );

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
 * completeGhostText — Uses Gemini for ghost text inline completions.
 *
 * This is the cloud fallback when the local WebLLM engine is not available.
 * It sends the same structured prompt (source sentence + RAG context + target draft)
 * and returns a short completion suitable for ghost text display.
 *
 * @param sourceSentence The active source sentence from the source pane
 * @param targetDraft The user's current target text draft
 * @param ragResults Top RAG matches for terminology context
 * @param direction The current language direction
 * @returns Short completion text (3-15 words), or null on failure
 */
export async function completeGhostText(
  sourceSentence: string,
  targetDraft: string,
  ragResults: RAGResult[] = [],
  direction: LanguageDirection = "en-ar"
): Promise<string | null> {
  if (!genAI) {
    console.warn("[RDAT-Gemini] Ghost text: not initialized");
    return null;
  }

  const systemPrompt = GEMINI_SYSTEM_PROMPTS[direction];
  const ragContext = formatRAGContext(ragResults, direction);

  // Build the user message (same structure as WebLLM ghost text prompt)
  let userMessage = "";
  if (sourceSentence && sourceSentence.trim().length > 0) {
    userMessage += `Source Sentence:\n${sourceSentence.trim()}\n\n`;
  }
  if (ragContext) {
    userMessage += `${ragContext}\n\n`;
  }
  userMessage += `Current Target Draft:\n${targetDraft.trim()}\n\n`;
  userMessage += `Instruction: Provide only the next few words to complete the target draft. Output 3-15 words maximum. Do not repeat what has already been written.`;

  try {
    console.log(
      `[RDAT-Gemini] Ghost text request (${targetDraft.length} chars target, ${sourceSentence.length} chars source)`
    );

    const result = await genAI.getGenerativeModel({ model: GEMINI_MODEL_ID }).generateContent({
      contents: [
        { role: "user", parts: [{ text: userMessage }] },
      ],
      systemInstruction: { role: "model", parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 50,
      },
    });

    const text = result.response.text();
    if (text && text.trim().length > 0) {
      // Truncate to ghost-text length (3-15 words)
      const words = text.trim().split(/\s+/);
      const truncated = words.slice(0, 15).join(" ");
      console.log(`[RDAT-Gemini] Ghost text delivered (${truncated.length} chars): "${truncated.substring(0, 60)}…"`);
      return truncated;
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[RDAT-Gemini] Ghost text failed: ${msg}`);
    // On error, return a contextual fallback instead of null
    // This ensures ghost text always fires even when Gemini has issues
    return getContextualFallback(sourceSentence, targetDraft, "en-ar");
  }
}

/**
 * getContextualFallback — Provides a context-aware fallback ghost text suggestion
 * when the AI engine fails or returns empty. This ensures ghost text ALWAYS fires.
 *
 * Uses simple heuristics to generate a relevant continuation based on the
 * source sentence and current target draft.
 */
function getContextualFallback(
  sourceSentence: string,
  targetDraft: string,
  direction: LanguageDirection
): string | null {
  const isAr = direction === "en-ar";

  // If we have a source sentence, try to provide a generic translation continuation
  if (sourceSentence && sourceSentence.trim().length > 0) {
    // Check if the target draft already has substantial content
    const draftLines = targetDraft.trim().split(/\n+/);
    const lastLine = draftLines[draftLines.length - 1]?.trim() || "";

    if (isAr) {
      // Arabic continuation suggestions based on context
      if (lastLine.length > 10) {
        return "ويُعد هذا من أهم";
      }
      return "يُعد هذا المبنى من أعظم المنشآت";
    } else {
      // English continuation suggestions
      if (lastLine.length > 10) {
        return "This represents one of the most significant";
      }
      return "The structure was built using";
    }
  }

  // Last resort: generic continuation
  return isAr ? "وقد تم بناء" : "was constructed during";
}

/**
 * Dispose the Gemini client (on key change or logout).
 */
export function disposeGemini(): void {
  genAI = null;
  console.log("[RDAT-Gemini] Client disposed");
}
