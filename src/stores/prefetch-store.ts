import { create } from "zustand";

/**
 * Prefetch Store — caches AI translations by line number.
 *
 * When the user is on Line N, lines N+1 and N+2 are translated
 * in the background and stored here. The Ghost Text provider
 * checks this cache first before calling the engine.
 */

interface PrefetchEntry {
  translation: string;
  source: string;
  timestamp: number;
  engine: "lte" | "rag" | "webllm" | "gemini";
}

interface PrefetchState {
  /** Map<lineNumber, PrefetchEntry> */
  cache: Map<number, PrefetchEntry>;

  /** Set a cached translation for a line */
  setPrefetch: (line: number, entry: PrefetchEntry) => void;

  /** Get a cached translation for a line */
  getPrefetch: (line: number) => PrefetchEntry | null;

  /** Clear cache for a line */
  clearPrefetch: (line: number) => void;

  /** Clear entire cache */
  clearAll: () => void;

  /** Currently active line being edited */
  activeLine: number | null;
  setActiveLine: (line: number | null) => void;

  /** Source lines text (for context) */
  sourceLines: string[];
  setSourceLines: (lines: string[]) => void;
}

export const usePrefetchStore = create<PrefetchState>((set, get) => ({
  cache: new Map(),
  activeLine: null,
  sourceLines: [],

  setPrefetch: (line, entry) => {
    set((state) => {
      const newCache = new Map(state.cache);
      newCache.set(line, entry);
      return { cache: newCache };
    });
  },

  getPrefetch: (line) => {
    return get().cache.get(line) ?? null;
  },

  clearPrefetch: (line) => {
    set((state) => {
      const newCache = new Map(state.cache);
      newCache.delete(line);
      return { cache: newCache };
    });
  },

  clearAll: () => {
    set({ cache: new Map() });
  },

  setActiveLine: (line) => {
    set({ activeLine: line });
  },

  setSourceLines: (lines) => {
    set({ sourceLines: lines });
  },
}));
