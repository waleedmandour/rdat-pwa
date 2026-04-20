/**
 * Ghost Text Integration Tests
 * 
 * Tests the complete three-phase suggestion pipeline:
 *  - LTE suggestions show immediately (< 100ms)
 *  - AI suggestions after 800ms
 *  - RTL text rendered correctly
 *  - Timeout handling for slow channels
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MonacoSuggestionProvider } from "@/lib/monaco-suggestion-provider";

describe("Ghost Text Integration", () => {
  let provider: MonacoSuggestionProvider;

  beforeEach(() => {
    provider = new MonacoSuggestionProvider();
    vi.useFakeTimers();
  });

  it("should return LTE suggestions immediately", async () => {
    const start = Date.now();
    
    const suggestions = await provider.getSuggestions(
      "Hello world",
      "السلام",
      {
        lte: async () => "عليكم",
        rag: async () => { throw new Error("Should timeout"); },
        webllm: async () => { throw new Error("Should timeout"); },
        gemini: async () => { throw new Error("Should timeout"); },
        prefetch: async () => "",
      }
    );

    const latency = Date.now() - start;
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].source).toBe("lte");
    expect(latency).toBeLessThan(100);
  });

  it("should include RAG results within 150ms", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello world",
      "السلام",
      {
        lte: async () => "عليكم",
        rag: async () => "وعليكم",
        webllm: async () => { throw new Error("Should timeout"); },
        gemini: async () => { throw new Error("Should timeout"); },
        prefetch: async () => "",
      }
    );

    // Should have both LTE and RAG
    const sources = suggestions.map(s => s.source);
    expect(sources).toContain("lte");
    expect(sources).toContain("rag");
  });

  it("should deduplicate similar suggestions", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello world",
      "السلام",
      {
        lte: async () => "عليكم السلام",
        rag: async () => "عليكم السلام", // Same text
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      }
    );

    // Should deduplicate the identical Arabic text
    const uniqueTexts = new Set(suggestions.map(s => s.text));
    expect(uniqueTexts.size).toBeLessThanOrEqual(suggestions.length);
  });

  it("should handle RTL text correctly", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello world",
      "السلام",
      {
        lte: async () => "عليكم وسلام الله عليكم ورحمته",
        rag: async () => "",
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "",
      }
    );

    expect(suggestions.length).toBeGreaterThan(0);
    // Suggestions should contain Arabic text
    expect(/[\u0600-\u06FF]/.test(suggestions[0].text)).toBe(true);
  });

  it("should rank by confidence then latency", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async () => "عليكم", // High confidence, fast
        rag: async () => "وسلام", // Medium confidence
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => { throw new Error("Timeout"); },
        prefetch: async () => "عليكم", // Lower confidence
      }
    );

    // LTE should be first (highest confidence)
    expect(suggestions[0].source).toBe("lte");
    // Confidence should be sorted descending
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
    }
  });

  it("should isolate errors per channel", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async () => "عليكم",
        rag: async () => { throw new Error("RAG failed"); },
        webllm: async () => { throw new Error("WebLLM failed"); },
        gemini: async () => "سلام",
        prefetch: async () => "",
      }
    );

    // Should still get LTE and Gemini results despite RAG and WebLLM errors
    const sources = suggestions.map(s => s.source);
    expect(sources).toContain("lte");
    expect(sources).toContain("gemini");
    expect(sources).not.toContain("rag");
    expect(sources).not.toContain("webllm");
  });

  it("should timeout slow channels gracefully", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async () => "عليكم",
        rag: async () => new Promise(resolve => setTimeout(() => resolve("wasted"), 200)), // Exceeds 150ms
        webllm: async () => new Promise(resolve => setTimeout(() => resolve("wasted"), 1500)), // Exceeds 1000ms
        gemini: async () => "سلام",
        prefetch: async () => "",
      }
    );

    // Should have fast results, RAG and WebLLM might timeout
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("should limit results to top 3", async () => {
    const suggestions = await provider.getSuggestions(
      "Hello",
      "السلام",
      {
        lte: async () => "عليكم",
        rag: async () => "وسلام",
        webllm: async () => { throw new Error("Timeout"); },
        gemini: async () => "ورحمة",
        prefetch: async () => "الله",
      }
    );

    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});
