import type { CorpusEntry } from "./rag-types";
import type { AMTALintIssue } from "@/types";
import { AMTA_MIN_TERM_LENGTH } from "./constants";

/**
 * AMTA Linter — Scans editor text for English legal terms from the glossary
 * and flags them if they appear untranslated or improperly translated.
 *
 * Strategy:
 * 1. For each English term in the glossary, search for it in the editor text
 * 2. If found, check if the corresponding Arabic term is also present nearby
 * 3. If the English term is found but Arabic translation is missing, flag it
 * 4. Return an array of lint issues for Monaco markers
 */

/**
 * lintText — Scans the editor text and returns AMTA lint issues.
 *
 * @param text The full editor text
 * @param glossary The translation memory entries (EN-AR pairs)
 * @returns Array of AMTALintIssue objects for each untranslated term found
 */
export function lintText(
  text: string,
  glossary: CorpusEntry[]
): AMTALintIssue[] {
  if (!text || text.trim().length === 0 || !glossary || glossary.length === 0) {
    return [];
  }

  const issues: AMTALintIssue[] = [];
  const lines = text.split("\n");

  for (const entry of glossary) {
    const enTerm = entry.en;
    const arTerm = entry.ar;

    // Skip very short terms
    if (enTerm.length < AMTA_MIN_TERM_LENGTH) continue;

    // Search for the English term in each line
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lowerLine = line.toLowerCase();
      const lowerTerm = enTerm.toLowerCase();

      // Find all occurrences of the English term in this line
      let searchFrom = 0;
      while (true) {
        const idx = lowerLine.indexOf(lowerTerm, searchFrom);
        if (idx === -1) break;

        // Check if the Arabic term is present in the same line or adjacent lines
        const contextWindow = getNearbyText(lines, lineIdx, 1);
        const hasArabicTranslation = contextWindow.includes(arTerm);

        if (!hasArabicTranslation) {
          // Found untranslated term — create a lint issue
          const startColumn = idx + 1; // Monaco is 1-based
          const endColumn = idx + enTerm.length + 1;

          issues.push({
            id: `amta-${entry.id}-${lineIdx}-${idx}`,
            enTerm,
            arTerm,
            context: entry.context,
            startLineNumber: lineIdx + 1, // Monaco is 1-based
            endLineNumber: lineIdx + 1,
            startColumn,
            endColumn,
            message: `AMTA: "${enTerm}" is not translated. Suggested: "${arTerm}"`,
          });
        }

        searchFrom = idx + 1;
      }
    }
  }

  console.log(`[RDAT-AMTA] Lint complete: ${issues.length} issues found`);
  if (issues.length > 0) {
    issues.forEach((issue) => {
      console.log(
        `  [RDAT-AMTA] Line ${issue.startLineNumber}: "${issue.enTerm}" → "${issue.arTerm}"`
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
 * Returns the text edit that replaces the English term with the Arabic one.
 */
export function buildAMTACodeAction(issue: AMTALintIssue): {
  title: string;
  edit: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string };
} {
  return {
    title: `AMTA: Replace "${issue.enTerm}" → "${issue.arTerm}"`,
    edit: {
      range: {
        startLineNumber: issue.startLineNumber,
        startColumn: issue.startColumn,
        endLineNumber: issue.endLineNumber,
        endColumn: issue.endColumn,
      },
      text: issue.arTerm,
    },
  };
}
