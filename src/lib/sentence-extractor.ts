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
