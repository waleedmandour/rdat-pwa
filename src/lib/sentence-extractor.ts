/**
 * extractCurrentSentence — Extracts the sentence around the user's
 * current typing position from the full editor text.
 *
 * Strategy:
 * 1. Split text into lines
 * 2. Take the last non-empty line (where the user is likely typing)
 * 3. From that line, find the last sentence boundary (. ! ? \n)
 * 4. Return everything from the last boundary to the end (partial sentence)
 *
 * This gives us the "in-progress" sentence for RAG queries.
 */
export function extractCurrentSentence(text: string): string {
  if (!text || text.trim().length === 0) return "";

  const lines = text.split("\n");
  // Find the last non-empty line
  let lastLine = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      lastLine = lines[i];
      break;
    }
  }

  if (!lastLine) return "";

  // Sentence-ending punctuation
  const sentenceBoundaries = /[.!?。！？]/g;
  let lastBoundary = -1;
  let match: RegExpExecArray | null;

  while ((match = sentenceBoundaries.exec(lastLine)) !== null) {
    lastBoundary = match.index + 1; // position after the punctuation
  }

  // Extract from the last boundary to the end of the line
  const sentence =
    lastBoundary >= 0
      ? lastLine.substring(lastBoundary).trim()
      : lastLine.trim();

  return sentence || lastLine.trim();
}

/**
 * truncateForEmbedding — Truncates text to a safe length for embedding.
 * Most embedding models have a max token limit (~128-512 tokens).
 * As a rough heuristic, we truncate to ~2000 characters.
 */
export function truncateForEmbedding(text: string, maxChars = 2000): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "…";
}

/**
 * getSourceLine — Extracts a specific line from the source text by line number.
 * Used in the split-pane architecture: when the user is on line N in the
 * target editor, this fetches line N from the source editor for RAG queries.
 *
 * @param sourceText The full source document text
 * @param lineNumber 1-based line number (Monaco uses 1-based)
 * @returns The text content of that line, or empty string if out of bounds
 */
export function getSourceLine(sourceText: string, lineNumber: number): string {
  if (!sourceText || lineNumber < 1) return "";
  const lines = sourceText.split("\n");
  if (lineNumber > lines.length) return "";
  return lines[lineNumber - 1]; // Convert 1-based to 0-based index
}

/**
 * getSourceSentence — Extracts a full sentence from the source text
 * starting at a given line number. Looks forward from the line to find
 * the complete sentence (handles multi-line sentences).
 *
 * Strategy: Start at the given line, accumulate text until a sentence
 * boundary (. ! ?) is found or we exceed a reasonable line window.
 *
 * @param sourceText The full source document text
 * @param lineNumber 1-based starting line number
 * @param maxLines Maximum number of lines to look ahead
 * @returns The extracted sentence, or empty string if no valid content
 */
export function getSourceSentence(sourceText: string, lineNumber: number, maxLines = 5): string {
  if (!sourceText || lineNumber < 1) return "";
  const lines = sourceText.split("\n");
  const startIdx = Math.min(lineNumber - 1, lines.length - 1);

  // Find the sentence start: look backwards from startIdx for a sentence boundary
  let sentenceStart = startIdx;
  for (let i = startIdx; i >= Math.max(0, startIdx - 2); i--) {
    if (/[.!?。！？]$/.test(lines[i].trim())) {
      sentenceStart = i + 1;
      break;
    }
  }

  // Accumulate lines until we find a sentence boundary or exceed maxLines
  let result = "";
  for (let i = sentenceStart; i < Math.min(lines.length, sentenceStart + maxLines); i++) {
    result += (result ? " " : "") + lines[i].trim();
    if (/[.!?。！？]/.test(lines[i].trim())) {
      break;
    }
  }

  return result.trim();
}
