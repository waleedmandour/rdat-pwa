import type { CorpusEntry } from "./rag-types";
import type { AMTALintIssue } from "@/types";
import type { LanguageDirection } from "@/types";
import { AMTA_MIN_TERM_LENGTH } from "./constants";

/**
 * AMTA Linter — Scans editor text for untranslated terms from the glossary
 * and flags them if they appear untranslated or improperly translated.
 *
 * Strategy:
 * 1. For EN→AR: search for English terms in editor, check Arabic translation nearby
 * 2. For AR→EN: search for Arabic terms in editor, check English translation nearby
 *
 * Matching rules:
 * - Terms must match as whole words (bounded by non-alphanumeric chars or string edges)
 * - Smart/curly quotes and invisible Unicode chars are normalized to ASCII before matching
 */

/**
 * Smart / curly quote characters and other invisible Unicode chars to normalize.
 * These are replaced with their standard ASCII equivalents.
 */
const SMART_QUOTE_MAP: Record<string, string> = {
  "\u2018": "'", // left single quotation mark
  "\u2019": "'", // right single quotation mark (apostrophe)
  "\u201A": "'", // single low-9 quotation mark
  "\u201B": "'", // single high-reversed-9 quotation mark
  "\u201C": '"', // left double quotation mark
  "\u201D": '"', // right double quotation mark
  "\u201E": '"', // double low-9 quotation mark
  "\u201F": '"', // double high-reversed-9 quotation mark
  "\u300C": '"', // left corner bracket (CJK)
  "\u300D": '"', // right corner bracket (CJK)
  "\u300E": '"', // left white corner bracket (CJK)
  "\u300F": '"', // right white corner bracket (CJK)
  "\uFF02": '"', // fullwidth quotation mark
  "\uFF07": "'", // fullwidth apostrophe
  "\u200B": "",   // zero-width space
  "\u200C": "",   // zero-width non-joiner
  "\u200D": "",   // zero-width joiner
  "\uFEFF": "",   // zero-width no-break space (BOM)
};

/**
 * sanitizeText — Replaces smart/curly quotes and invisible Unicode characters
 * with their standard ASCII equivalents (or removes them entirely).
 */
function sanitizeText(text: string): string {
  let result = text;
  for (const [smart, ascii] of Object.entries(SMART_QUOTE_MAP)) {
    result = result.replaceAll(smart, ascii);
  }
  return result;
}

/**
 * isWholeWordMatch — Checks whether a match at position `idx` in `line`
 * with length `termLength` is a whole word match.
 *
 * A whole word is bounded on both sides by non-alphanumeric characters
 * (or the start/end of the string). This prevents matching "Liability"
 * inside "Strict Liability" won't match as a substring of "Liabilities",
 * and "the" won't match inside "other".
 */
function isWholeWordMatch(line: string, idx: number, termLength: number): boolean {
  // Check left boundary: the character before the match must be non-alphanumeric
  if (idx > 0) {
    const charBefore = line[idx - 1];
    if (/[a-zA-Z0-9\u0600-\u06FF]/.test(charBefore)) {
      return false;
    }
  }

  // Check right boundary: the character after the match must be non-alphanumeric
  const endIdx = idx + termLength;
  if (endIdx < line.length) {
    const charAfter = line[endIdx];
    if (/[a-zA-Z0-9\u0600-\u06FF]/.test(charAfter)) {
      return false;
    }
  }

  return true;
}

/**
 * lintText — Scans the editor text and returns AMTA lint issues.
 *
 * @param text The full editor text
 * @param glossary The translation memory entries (EN-AR pairs)
 * @param direction The current language direction
 * @returns Array of AMTALintIssue objects for each untranslated term found
 */
export function lintText(
  text: string,
  glossary: CorpusEntry[],
  direction: LanguageDirection = "en-ar"
): AMTALintIssue[] {
  if (!text || text.trim().length === 0 || !glossary || glossary.length === 0) {
    return [];
  }

  const issues: AMTALintIssue[] = [];
  const lines = text.split("\n");
  const isForward = direction === "en-ar";

  for (const entry of glossary) {
    const enTerm = entry.en;
    const arTerm = entry.ar;

    // In forward mode, search for English terms; in reverse, search for Arabic terms
    const searchTerm = isForward ? enTerm : arTerm;
    const checkTerm = isForward ? arTerm : enTerm;

    // Skip very short terms
    if (searchTerm.length < AMTA_MIN_TERM_LENGTH) continue;

    // Sanitize the search term (strip smart quotes, invisible chars)
    const sanitizedSearchTerm = sanitizeText(searchTerm).toLowerCase();
    // Sanitize the check term for context matching
    const sanitizedCheckTerm = sanitizeText(checkTerm).toLowerCase();

    // Search for the term in each line
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      // Sanitize the line being searched
      const sanitizedLine = sanitizeText(line).toLowerCase();

      // Find all occurrences in this line
      let searchFrom = 0;
      while (true) {
        const idx = sanitizedLine.indexOf(sanitizedSearchTerm, searchFrom);
        if (idx === -1) break;

        // Only match whole words
        if (isWholeWordMatch(sanitizedLine, idx, sanitizedSearchTerm.length)) {
          // Check if the corresponding translation is present nearby
          // Use sanitized text for the context check too
          const contextWindow = getNearbyText(lines, lineIdx, 1);
          const sanitizedContext = sanitizeText(contextWindow).toLowerCase();
          const hasTranslation = sanitizedContext.includes(sanitizedCheckTerm);

          if (!hasTranslation) {
            // Use the original line for column positions (not sanitized)
            // We need to find the actual term position in the original line.
            // The index in the sanitized line maps to the sanitized string,
            // but the column in the original line might differ if chars were removed.
            // For column accuracy, search in the original line around the same area.
            const originalIdx = findOriginalTermIndex(line, searchTerm, idx);
            if (originalIdx !== -1) {
              const startColumn = originalIdx + 1; // Monaco is 1-based
              const endColumn = originalIdx + searchTerm.length + 1;

              issues.push({
                id: `amta-${entry.id}-${lineIdx}-${originalIdx}`,
                enTerm,
                arTerm,
                context: entry.context,
                startLineNumber: lineIdx + 1, // Monaco is 1-based
                endLineNumber: lineIdx + 1,
                startColumn,
                endColumn,
                message: isForward
                  ? `AMTA: "${enTerm}" is not translated. Suggested: "${arTerm}"`
                  : `AMTA: "${arTerm}" is not translated. Suggested: "${enTerm}"`,
              });
            }
          }
        }

        searchFrom = idx + 1;
      }
    }
  }

  console.log(`[RDAT-AMTA] Lint complete (${direction}): ${issues.length} issues found`);
  if (issues.length > 0) {
    issues.forEach((issue) => {
      console.log(
        `  [RDAT-AMTA] Line ${issue.startLineNumber}: "${isForward ? issue.enTerm : issue.arTerm}" → "${isForward ? issue.arTerm : issue.enTerm}"`
      );
    });
  }

  return issues;
}

/**
 * findOriginalTermIndex — Finds the original term position in the unsanitized line,
 * searching near the sanitized match index to account for removed invisible chars.
 */
function findOriginalTermIndex(originalLine: string, originalTerm: string, sanitizedIdx: number): number {
  // Try to find the original term by searching from a position before the sanitized index
  // (since invisible chars may have been removed, shifting positions)
  const sanitizedOriginalTerm = sanitizeText(originalTerm).toLowerCase();
  const sanitizedOriginalLine = sanitizeText(originalLine).toLowerCase();

  // Verify the sanitized term exists at sanitizedIdx in the sanitized line
  if (sanitizedOriginalLine.substring(sanitizedIdx, sanitizedIdx + sanitizedOriginalTerm.length) !== sanitizedOriginalTerm) {
    return -1;
  }

  // Walk backwards from the sanitized index to find the corresponding position in the original line
  // Count how many invisible chars were removed before sanitizedIdx
  let originalPos = 0;
  let sanitizedPos = 0;
  for (originalPos = 0; originalPos < originalLine.length && sanitizedPos < sanitizedIdx; originalPos++) {
    const ch = originalLine[originalPos];
    // Check if this char gets removed during sanitization
    const replacement = SMART_QUOTE_MAP[ch];
    if (replacement === "") {
      // Char is removed entirely — skip it
      continue;
    }
    sanitizedPos++;
  }

  // originalPos now points to the first char of the match in the original line
  // Verify: the term at this position should match (ignoring smart quotes)
  const originalTermLower = sanitizeText(originalTerm).toLowerCase();
  const originalSubstr = sanitizeText(originalLine.substring(originalPos, originalPos + originalTerm.length)).toLowerCase();
  if (originalSubstr === originalTermLower) {
    return originalPos;
  }

  // Fallback: just search for the original term near the beginning
  const lowerLine = originalLine.toLowerCase();
  const lowerTerm = originalTerm.toLowerCase();
  const fallbackIdx = lowerLine.indexOf(lowerTerm);
  return fallbackIdx;
}

/**
 * getNearbyText — Gets text from nearby lines for context checking.
 */
function getNearbyText(lines: string[], centerLine: number, radius: number): string {
  const start = Math.max(0, centerLine - radius);
  const end = Math.min(lines.length - 1, centerLine + radius);
  return lines.slice(start, end + 1).join(" ");
}

/**
 * Build CodeAction for an AMTA lint issue.
 * Returns the text edit that replaces the source term with the target term.
 */
export function buildAMTACodeAction(
  issue: AMTALintIssue,
  direction: LanguageDirection = "en-ar"
): {
  title: string;
  edit: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string };
} {
  const isForward = direction === "en-ar";
  const searchTerm = isForward ? issue.enTerm : issue.arTerm;
  const replaceTerm = isForward ? issue.arTerm : issue.enTerm;

  return {
    title: isForward
      ? `AMTA: Replace "${issue.enTerm}" → "${issue.arTerm}"`
      : `AMTA: Replace "${issue.arTerm}" → "${issue.enTerm}"`,
    edit: {
      range: {
        startLineNumber: issue.startLineNumber,
        startColumn: issue.startColumn,
        endLineNumber: issue.endLineNumber,
        endColumn: issue.endColumn,
      },
      text: replaceTerm,
    },
  };
}
