/**
 * Monaco Suggestion Provider — Three-Phase Async Suggestion Engine
 *
 * Architecture:
 *  Phase 1 (0-5ms):     LTE Smart Remainder (synchronous)
 *  Phase 2 (0-150ms):   RAG Cache Lookup (embeddings + semantic search)
 *  Phase 3 (0-1000ms):  AI Channels (WebLLM local, Gemini cloud)
 *
 * Each channel runs independently with timeout isolation.
 * Deduplication and ranking applied before returning results.
 *
 * IMPORTANT: RTL rendering is handled entirely by Monaco Editor
 * when direction:"rtl" is set. Do NOT inject Unicode bidi control
 * characters (U+202E, U+200F, etc.) into suggestion text — they
 * corrupt ghost text display and cursor positioning.
 */

export interface SuggestionResult {
  text: string;
  source: "lte" | "rag" | "webllm" | "gemini" | "prefetch";
  latency: number;
  confidence: number;
  isBurst?: boolean; // true for 3-5 word burst, false for full
}

export interface ChannelResult {
  source: "lte" | "rag" | "webllm" | "gemini" | "prefetch";
  text: string;
  latency: number;
  confidence: number;
  error?: string;
}

interface ChannelConfig {
  timeout: number; // milliseconds
  priority: number; // 0-100, higher wins
  retryCount?: number;
}

/**
 * Three-phase async suggestion engine with proper channel isolation
 * and stale-request cancellation.
 */
export class MonacoSuggestionProvider {
  private channelConfigs: Map<string, ChannelConfig> = new Map([
    ["lte", { timeout: 50, priority: 100 }],
    ["rag", { timeout: 150, priority: 80 }],
    ["webllm", { timeout: 1000, priority: 60 }],
    ["gemini", { timeout: 1000, priority: 50 }],
    ["prefetch", { timeout: 50, priority: 75 }],
  ]);

  private lastRequestId: string = "";
  private dedupeCache: Map<string, SuggestionResult> = new Map();

  constructor() {
    // Cache expires every 60 seconds
    setInterval(() => {
      this.dedupeCache.clear();
    }, 60000);
  }

  /**
   * Cancel any in-flight request by bumping the request ID.
   * Called when the user types a new character so stale results
   * from a previous invocation are discarded.
   */
  cancelPending(): void {
    this.lastRequestId = `cancelled_${Date.now()}`;
  }

  /**
   * Main entry point: Orchestrate three-phase suggestion pipeline.
   *
   * @param sourceLine - Original English text
   * @param prefix - Current Arabic prefix typed by user
   * @param handlers - Channel-specific handlers
   * @returns Promise<SuggestionResult[]> sorted by confidence and latency
   */
  async getSuggestions(
    sourceLine: string,
    prefix: string,
    handlers: {
      lte: () => Promise<string>;
      rag: () => Promise<string>;
      webllm: () => Promise<string>;
      gemini: () => Promise<string>;
      prefetch: () => Promise<string>;
    }
  ): Promise<SuggestionResult[]> {
    const requestId = `${Date.now()}_${Math.random()}`;
    this.lastRequestId = requestId;

    const results: ChannelResult[] = [];

    const isStale = () => requestId !== this.lastRequestId;

    try {
      // Phase 1: LTE (synchronous, immediate)
      try {
        const lteResult = await this.withTimeout(handlers.lte(), 50, "lte");
        if (lteResult.text && !isStale()) {
          results.push({
            source: "lte",
            text: lteResult.text,
            latency: lteResult.latency,
            confidence: 0.95, // LTE is very confident
          });
        }
      } catch (err) {
        console.warn("[MonacoProvider] LTE error or timeout:", err);
      }

      if (isStale()) return [];

      // Phase 2: RAG (with 150ms timeout) and Prefetch (with 50ms timeout)
      // These run in parallel
      const phase2Start = performance.now();
      void phase2Start; // used for logging if needed
      const phase2Results = await Promise.allSettled([
        this.withTimeout(handlers.prefetch(), 50, "prefetch"),
        this.withTimeout(handlers.rag(), 150, "rag"),
      ]);

      for (const result of phase2Results) {
        if (
          result.status === "fulfilled" &&
          result.value &&
          !isStale()
        ) {
          const { source, text, latency } = result.value;
          if (text) {
            results.push({
              source,
              text,
              latency,
              confidence: source === "rag" ? 0.85 : 0.75,
            });
          }
        }
      }

      if (isStale()) return [];

      // Phase 3: AI channels (WebLLM + Gemini, 1000ms timeout)
      // Run in parallel, independent error isolation
      const phase3Results = await Promise.allSettled([
        this.withTimeout(handlers.webllm(), 1000, "webllm"),
        this.withTimeout(handlers.gemini(), 1000, "gemini"),
      ]);

      for (const result of phase3Results) {
        if (
          result.status === "fulfilled" &&
          result.value &&
          !isStale()
        ) {
          const { source, text, latency } = result.value;
          if (text) {
            results.push({
              source,
              text,
              latency,
              confidence: source === "webllm" ? 0.70 : 0.60,
            });
          }
        }
      }
    } catch (err) {
      console.error("[MonacoProvider] Pipeline error:", err);
    }

    if (isStale()) return [];

    // Deduplicate and rank results
    return this.dedupeAndRank(results);
  }

  /**
   * Wrapper for timeout handling with source identification.
   */
  private async withTimeout(
    promise: Promise<string>,
    timeoutMs: number,
    source: "lte" | "rag" | "webllm" | "gemini" | "prefetch"
  ): Promise<{ source: "lte" | "rag" | "webllm" | "gemini" | "prefetch"; text: string; latency: number }> {
    const start = performance.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${source} timeout`)), timeoutMs);
      promise.then(
        text => {
          clearTimeout(timer);
          resolve({ source, text, latency: performance.now() - start });
        },
        err => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * Deduplicate results and rank by confidence + latency.
   */
  private dedupeAndRank(results: ChannelResult[]): SuggestionResult[] {
    const uniqueResults = new Map<string, ChannelResult>();

    // Keep shortest match from each source
    for (const result of results) {
      const key = this.getNormalizedKey(result.text);
      if (!uniqueResults.has(key) || result.text.length < uniqueResults.get(key)!.text.length) {
        uniqueResults.set(key, result);
      }
    }

    // Convert and rank
    const suggestions: SuggestionResult[] = Array.from(uniqueResults.values())
      .map((r) => ({
        text: r.text,
        source: r.source as "lte" | "rag" | "webllm" | "gemini" | "prefetch",
        latency: r.latency,
        confidence: r.confidence,
      }))
      .sort((a, b) => {
        // Primary: confidence (higher first)
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence;
        }
        // Secondary: latency (lower first, prefer fast results)
        return a.latency - b.latency;
      })
      .slice(0, 3); // Return top 3 suggestions

    return suggestions;
  }

  /**
   * Normalize text for deduplication (handle Arabic diacritics, spaces).
   */
  private getNormalizedKey(text: string): string {
    // Remove Arabic diacritics and normalize spaces
    return text
      .replace(/[\u064B-\u0652]/g, "") // Remove Arabic diacritics
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /**
   * Calculate ghost text range for Monaco inline completion.
   * Monaco handles RTL positioning internally when direction:"rtl" is set.
   */
  static calculateGhostTextRange(
    lineNumber: number,
    column: number
  ): { start: number; end: number } {
    return {
      start: column,
      end: column,
    };
  }
}
