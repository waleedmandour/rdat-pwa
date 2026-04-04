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
 */

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
    const searchLabel = isForward ? "en" : "ar";

    // Skip very short terms
    if (searchTerm.length < AMTA_MIN_TERM_LENGTH) continue;

    // Search for the term in each line
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lowerLine = line.toLowerCase();
      const lowerTerm = searchTerm.toLowerCase();

      // Find all occurrences in this line
      let searchFrom = 0;
      while (true) {
        const idx = lowerLine.indexOf(lowerTerm, searchFrom);
        if (idx === -1) break;

        // Check if the corresponding translation is present nearby
        const contextWindow = getNearbyText(lines, lineIdx, 1);
        const hasTranslation = contextWindow.includes(checkTerm);

        if (!hasTranslation) {
          const startColumn = idx + 1; // Monaco is 1-based
          const endColumn = idx + searchTerm.length + 1;

          issues.push({
            id: `amta-${entry.id}-${lineIdx}-${idx}`,
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
