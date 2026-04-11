/**
 * Local Translation Engine (LTE) — Channel 0
 *
 * A blazing-fast (<5ms) synchronous phrase-table/n-gram matcher.
 * Does NOT use neural networks. Operates purely on:
 *  1. Exact/partial string matching
 *  2. "Smart Remainder" prefix completion
 *  3. N-gram overlap scoring
 *
 * Loaded at startup from /public/data/default-corpus-en-ar.json.
 * All data lives in memory — zero I/O after initialization.
 */

interface CorpusEntry {
  en: string;
  ar: string;
  type: string;
}

interface LTEResult {
  match: string;       // The matched Arabic translation
  source: string;      // The source English text
  remainder: string;   // Smart remainder to complete
  score: number;       // 0-1 match confidence
  type: "exact" | "partial" | "ngram";
}

/**
 * Normalize text for comparison:
 *  - Lowercase, trim, collapse whitespace
 *  - Remove trailing punctuation for prefix matching
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?،؛]+$/, "")
    .trim();
}

/**
 * Compute character-level Levenshtein distance (optimized for short strings).
 */
function levenshtein(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  // Early exit for empty strings
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  // Use two-row optimization to save memory
  let prev = new Int32Array(bLen + 1);
  let curr = new Int32Array(bLen + 1);

  for (let j = 0; j <= bLen; j++) prev[j] = j;

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // deletion
        prev[j] + 1,           // insertion
        prev[j - 1] + cost     // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[bLen];
}

/**
 * Compute n-gram overlap similarity (character trigrams).
 * Returns a 0-1 score.
 */
function ngramSimilarity(a: string, b: string): number {
  const getTrigrams = (s: string): Set<string> => {
    const trigrams = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) {
      trigrams.add(s.substring(i, i + 3));
    }
    return trigrams;
  };

  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);

  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  // Jaccard similarity
  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }

  const union = trigramsA.size + trigramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Local Translation Engine class.
 *
 * Loads the corpus into an efficient in-memory index and provides
 * instant phrase matching with "Smart Remainder" completion.
 */
export class LocalTranslationEngine {
  private corpus: CorpusEntry[] = [];
  private normalizedIndex: Map<string, CorpusEntry> = new Map();

  /**
   * Load corpus entries into memory.
   */
  load(entries: CorpusEntry[]) {
    this.corpus = entries;
    this.normalizedIndex.clear();

    for (const entry of entries) {
      const key = normalize(entry.en);
      this.normalizedIndex.set(key, entry);
    }

    console.log(`[LTE] Loaded ${entries.length} corpus entries into memory.`);
  }

  /**
   * Get a suggestion for the given source text and target prefix.
   *
   * Algorithm:
   *  1. Find the best matching English source (exact → partial → n-gram)
   *  2. Check if the corresponding Arabic starts with the user's prefix
   *  3. Return the "Smart Remainder" (what's left after the prefix)
   *
   * @param sourceText  The English source segment (full line or paragraph)
   * @param targetPrefix What the user has already typed in Arabic
   * @returns LTEResult or null if no match found
   */
  getSuggestion(sourceText: string, targetPrefix: string): LTEResult | null {
    if (!sourceText.trim()) return null;

    const normalizedSource = normalize(sourceText);

    // Step 1: Try exact match first (O(1) hash lookup)
    const exactMatch = this.normalizedIndex.get(normalizedSource);
    if (exactMatch) {
      return this.computeRemainder(
        exactMatch.en,
        exactMatch.ar,
        targetPrefix,
        "exact",
        1.0
      );
    }

    // Step 2: Try partial/prefix match on source
    // Find entries where the source starts with or contains the query
    let bestPartial: { entry: CorpusEntry; score: number } | null = null;

    for (const [key, entry] of this.normalizedIndex) {
      // Check if source text contains this corpus key (or vice versa)
      if (key.includes(normalizedSource) || normalizedSource.includes(key)) {
        const score = key.length / Math.max(key.length, normalizedSource.length);
        if (!bestPartial || score > bestPartial.score) {
          bestPartial = { entry, score: score * 0.85 }; // Penalize partial
        }
      }
    }

    if (bestPartial && bestPartial.score > 0.6) {
      return this.computeRemainder(
        bestPartial.entry.en,
        bestPartial.entry.ar,
        targetPrefix,
        "partial",
        bestPartial.score
      );
    }

    // Step 3: N-gram similarity fallback
    let bestNgram: { entry: CorpusEntry; score: number } | null = null;

    for (const entry of this.corpus) {
      const sim = ngramSimilarity(normalizedSource, normalize(entry.en));
      if (!bestNgram || sim > bestNgram.score) {
        bestNgram = { entry, score: sim };
      }
    }

    if (bestNgram && bestNgram.score > 0.3) {
      return this.computeRemainder(
        bestNgram.entry.en,
        bestNgram.entry.ar,
        targetPrefix,
        "ngram",
        bestNgram.score
      );
    }

    return null;
  }

  /**
   * Compute the "Smart Remainder" — the completion text after the prefix.
   */
  private computeRemainder(
    source: string,
    fullArabic: string,
    targetPrefix: string,
    matchType: LTEResult["type"],
    baseScore: number
  ): LTEResult {
    const trimmedPrefix = targetPrefix.trim();

    // Check if the Arabic starts with the prefix
    if (trimmedPrefix && !fullArabic.trim().startsWith(trimmedPrefix)) {
      // Even if it doesn't match the prefix exactly, still return the full
      // Arabic as a suggestion (the user might want to replace what they typed)
      return {
        match: fullArabic,
        source,
        remainder: fullArabic,
        score: baseScore * 0.5, // Lower confidence for non-prefix matches
        type: matchType,
      };
    }

    // Compute the remainder (what comes after the prefix)
    const remainder = trimmedPrefix
      ? fullArabic.substring(trimmedPrefix.length).trimStart()
      : fullArabic;

    return {
      match: fullArabic,
      source,
      remainder,
      score: baseScore,
      type: matchType,
    };
  }

  /**
   * Search the corpus by English text — returns top-k matches.
   * Used for finding relevant translations without RAG.
   */
  search(sourceText: string, limit = 5): Array<{
    en: string;
    ar: string;
    score: number;
    type: string;
  }> {
    const normalizedSource = normalize(sourceText);

    const scored = this.corpus.map((entry) => {
      const key = normalize(entry.en);
      const similarity = ngramSimilarity(normalizedSource, key);
      return { ...entry, score: similarity };
    });

    return scored
      .filter((s) => s.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ en, ar, score, type }) => ({ en, ar, score, type }));
  }

  /**
   * Get corpus statistics.
   */
  getStats() {
    return {
      entries: this.corpus.length,
      indexedKeys: this.normalizedIndex.size,
    };
  }
}

// Singleton instance for global access
let lteInstance: LocalTranslationEngine | null = null;

/**
 * Get or create the LTE singleton.
 */
export function getLTE(): LocalTranslationEngine {
  if (!lteInstance) {
    lteInstance = new LocalTranslationEngine();
  }
  return lteInstance;
}
