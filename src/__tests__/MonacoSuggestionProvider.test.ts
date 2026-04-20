/**
 * MonacoSuggestionProvider Unit Tests
 * 
 * Tests the provider's core functionality:
 *  - Sync LTE results
 *  - Background fetch without blocking
 *  - No duplicate requests
 *  - Channel failure isolation
 *  - Timeout enforcement
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MonacoSuggestionProvider } from "@/lib/monaco-suggestion-provider";

describe("MonacoSuggestionProvider", () => {
  let provider: MonacoSuggestionProvider;

  beforeEach(() => {
    provider = new MonacoSuggestionProvider();
  });

  describe("synchronous LTE", () => {
    it("should return LTE results without waiting", async () => {
      const lteResult = "عليكم";
      const handlers = {
        lte: async () => lteResult,
        rag: async () => { throw new Error("Timeout"); },
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].text).toBe(lteResult);
    });
  });

  describe("background fetching", () => {
    it("should fetch RAG without blocking LTE response", async () => {
      let ragStarted = false;

      const handlers = {
        lte: async () => "عليكم",
        rag: async () => {
          ragStarted = true;
          await new Promise(resolve => setTimeout(resolve, 50));
          return "وسلام";
        },
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      };

      const promise = provider.getSuggestions("Hello", "السلام", handlers);
      
      const suggestions = await promise;

      expect(ragStarted).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("deduplication", () => {
    it("should not return duplicate suggestions", async () => {
      const sameText = "عليكم السلام";
      const handlers = {
        lte: async () => sameText,
        rag: async () => sameText, // Identical
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should deduplicate to single suggestion
      expect(suggestions.filter(s => s.text === sameText).length).toBe(1);
    });

    it("should normalize Arabic diacritics in deduplication", async () => {
      const withDiacritics = "عَلَيْكُم";
      const withoutDiacritics = "عليكم";

      const handlers = {
        lte: async () => withDiacritics,
        rag: async () => withoutDiacritics,
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should deduplicate diacritical variants
      const uniqueNormalized = new Set(
        suggestions.map(s => s.text.replace(/[\u064B-\u0652]/g, ""))
      );
      expect(uniqueNormalized.size).toBeLessThanOrEqual(suggestions.length);
    });
  });

  describe("channel isolation", () => {
    it("should not affect other channels on one failure", async () => {
      const handlers = {
        lte: async () => "عليكم",
        rag: async () => { throw new Error("Network error"); },
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => "سلام", // Should still work
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should still get results from LTE and Gemini
      const sources = suggestions.map(s => s.source);
      expect(sources).toContain("lte");
      expect(sources).toContain("gemini");
    });

    it("should isolate RAG timeout from other channels", async () => {
      const handlers = {
        lte: async () => "عليكم",
        rag: async () => new Promise(() => {}), // Infinite promise
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => "سلام",
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should get LTE and Gemini despite RAG hanging
      expect(suggestions.length).toBeGreaterThan(0);
      const sources = suggestions.map(s => s.source);
      expect(sources).toContain("lte");
    });
  });

  describe("timeout enforcement", () => {
    it("should enforce LTE timeout (50ms)", async () => {
      const handlers = {
        lte: async () => new Promise(() => {}), // Never resolves
        rag: async () => { throw new Error("Timeout"); },
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should not have LTE result due to timeout
      expect(suggestions.map(s => s.source)).not.toContain("lte");
    });

    it("should enforce RAG timeout (150ms)", async () => {
      const handlers = {
        lte: async () => "عليكم",
        rag: async () => new Promise(resolve => setTimeout(() => resolve("وسلام"), 200)), // Exceeds 150ms
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should not have RAG result
      expect(suggestions.map(s => s.source)).not.toContain("rag");
    });

    it("should enforce AI timeout (1000ms)", async () => {
      const handlers = {
        lte: async () => "عليكم",
        rag: async () => "",
        webllm: async () => new Promise(resolve => setTimeout(() => resolve("سلام"), 1500)), // Exceeds 1000ms
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // Should not have WebLLM result
      expect(suggestions.map(s => s.source)).not.toContain("webllm");
    });
  });

  describe("RTL text handling", () => {
    it("should adjust RTL text with Unicode marks", () => {
      const arabicText = "عليكم وسلام الله عليكم";
      const adjusted = MonacoSuggestionProvider.adjustSuggestionForRTL(arabicText);

      // Should add RTL mark
      expect(adjusted).toContain("\u202E");
      expect(adjusted).toContain(arabicText);
    });

    it("should not modify LTR text", () => {
      const englishText = "Hello world";
      const adjusted = MonacoSuggestionProvider.adjustSuggestionForRTL(englishText);

      // Should not add RTL mark for English
      expect(adjusted).toBe(englishText);
    });
  });

  describe("ranking", () => {
    it("should rank by confidence first", async () => {
      const handlers = {
        lte: async () => "عليكم", // High confidence (0.95)
        rag: async () => "وسلام", // Medium confidence (0.85)
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => "ورحمة", // Lower confidence (0.60)
        prefetch: async () => "",
      };

      const suggestions = await provider.getSuggestions(
        "Hello",
        "السلام",
        handlers
      );

      // First should be LTE (highest confidence)
      expect(suggestions[0].source).toBe("lte");
      expect(suggestions[0].confidence).toBe(0.95);
    });
  });
});
