/**
 * Flexible XML Parser for RDAT Copilot
 *
 * Supports TMX (Translation Memory eXchange), XLIFF (XML Localization Interchange
 * File Format), and custom XML formats. Uses the browser-native DOMParser API to
 * parse XML content and extract translation pairs into the standard CorpusEntry
 * format used by the RAG pipeline.
 *
 * Output format: { id: string, type: 'translation_memory', en: string, ar: string }
 *
 * Supports a configurable entry limit (default 5000) with a toast notification
 * when the limit is exceeded, informing the user that the corpus has been sliced.
 */

import type { CorpusEntry } from "@/lib/rag-types";

// ─── Configuration ─────────────────────────────────────────────────────

/** Maximum number of translation units to extract from an XML file */
export const XML_PARSER_MAX_ENTRIES = 5000;

/** Storage key prefix for parsed XML corpora persisted in localStorage */
export const XML_PARSER_STORAGE_PREFIX = "rdat-xml-corpus-";

// ─── Result Types ──────────────────────────────────────────────────────

export interface XMLParseResult {
  entries: CorpusEntry[];
  format: XMLFormat;
  totalInFile: number;
  sliced: boolean;
  sliceLimit: number;
  fileName: string;
}

export type XMLFormat = "tmx" | "xliff" | "custom" | "unknown";

// ─── Format Detection ──────────────────────────────────────────────────

/**
 * Detects the XML format from the document structure.
 * Checks for well-known root element and namespace patterns.
 */
export function detectXMLFormat(xmlString: string): XMLFormat {
  const stripped = xmlString.trim();

  // TMX: root element is <tmx>
  if (/<tmx\s/i.test(stripped)) return "tmx";

  // XLIFF: root element is <xliff>
  if (/<xliff\s/i.test(stripped)) return "xliff";

  // Custom XML: any other well-formed XML with a root element
  if (/^<\?xml/i.test(stripped) || /^<[a-zA-Z]/.test(stripped)) return "custom";

  return "unknown";
}

// ─── TMX Parser ────────────────────────────────────────────────────────

/**
 * Parses TMX (Translation Memory eXchange) format.
 *
 * TMX structure:
 *   <tmx>
 *     <body>
 *       <tu tuid="...">
 *         <tuv xml:lang="en"><seg>English text</seg></tuv>
 *         <tuv xml:lang="ar"><seg>Arabic text</seg></tuv>
 *       </tu>
 *     </body>
 *   </tmx>
 *
 * Handles language codes: en, ar, eng, ara, en-US, ar-SA, etc.
 * Prefers English and Arabic language variants; skips TUs missing either.
 */
function parseTMX(doc: Document, maxEntries: number): { entries: CorpusEntry[]; total: number } {
  const entries: CorpusEntry[] = [];
  const tuNodes = doc.querySelectorAll("tu");
  let idCounter = 0;

  for (const tu of tuNodes) {
    const tuvs = tu.querySelectorAll("tuv");
    let enText = "";
    let arText = "";

    for (const tuv of tuvs) {
      const lang = (tuv.getAttribute("xml:lang") || "").toLowerCase();
      const seg = tuv.querySelector("seg");
      const text = seg?.textContent?.trim() || "";

      if (!text) continue;

      // Match English variants
      if (/^(en|eng)/.test(lang)) {
        if (!enText) enText = text; // Take first English variant
      }
      // Match Arabic variants
      else if (/^(ar|ara)/.test(lang)) {
        if (!arText) arText = text; // Take first Arabic variant
      }
    }

    // Only include TUs that have both English and Arabic
    if (enText && arText) {
      const tuid = tu.getAttribute("tuid") || `tmx_${String(++idCounter).padStart(5, "0")}`;
      entries.push({
        id: tuid,
        type: "translation_memory",
        en: enText,
        ar: arText,
        context: "tmx",
      });
    }

    if (entries.length >= maxEntries) break;
  }

  return { entries, total: tuNodes.length };
}

// ─── XLIFF Parser ──────────────────────────────────────────────────────

/**
 * Parses XLIFF (XML Localization Interchange File Format).
 *
 * XLIFF 1.x structure:
 *   <xliff>
 *     <file source-language="en" target-language="ar">
 *       <body>
 *         <trans-unit id="...">
 *           <source>English text</source>
 *           <target>Arabic text</target>
 *         </trans-unit>
 *       </body>
 *     </file>
 *   </xliff>
 *
 * XLIFF 2.x structure:
 *   <xliff>
 *     <file source-language="en" target-language="ar">
 *       <unit id="...">
 *         <segment>
 *           <source>English text</source>
 *           <target>Arabic text</target>
 *         </segment>
 *       </unit>
 *     </file>
 *   </xliff>
 *
 * Handles both XLIFF 1.x and 2.x formats. Falls back to detecting
 * the direction from file-level attributes if no explicit lang pair.
 */
function parseXLIFF(doc: Document, maxEntries: number): { entries: CorpusEntry[]; total: number } {
  const entries: CorpusEntry[] = [];
  let total = 0;

  // Determine source and target languages from file-level attributes
  const fileNodes = doc.querySelectorAll("file");
  let fileSourceLang = "en";
  let fileTargetLang = "ar";

  for (const file of fileNodes) {
    const srcLang = file.getAttribute("source-language") || "";
    const tgtLang = file.getAttribute("target-language") || "";
    if (srcLang) fileSourceLang = srcLang.toLowerCase().split("-")[0];
    if (tgtLang) fileTargetLang = tgtLang.toLowerCase().split("-")[0];
  }

  // Determine language direction
  const isEnAr = (fileSourceLang.startsWith("en") && fileTargetLang.startsWith("ar"));
  const isArEn = (fileSourceLang.startsWith("ar") && fileTargetLang.startsWith("en"));

  // Try XLIFF 1.x: <trans-unit> → <source>/<target>
  const transUnits = doc.querySelectorAll("trans-unit");

  if (transUnits.length > 0) {
    for (const tu of transUnits) {
      total++;
      const source = tu.querySelector("source");
      const target = tu.querySelector("target");
      const srcText = source?.textContent?.trim() || "";
      const tgtText = target?.textContent?.trim() || "";

      if (!srcText || !tgtText) continue;

      const unitId = tu.getAttribute("id") || `xliff_${total}`;
      let enText: string;
      let arText: string;

      if (isArEn) {
        enText = tgtText;
        arText = srcText;
      } else {
        enText = srcText;
        arText = tgtText;
      }

      entries.push({
        id: unitId,
        type: "translation_memory",
        en: enText,
        ar: arText,
        context: "xliff",
      });

      if (entries.length >= maxEntries) break;
    }
  }

  // Try XLIFF 2.x: <unit> → <segment> → <source>/<target>
  if (entries.length === 0) {
    const units = doc.querySelectorAll("unit");

    for (const unit of units) {
      total++;
      const segments = unit.querySelectorAll("segment");

      for (const segment of segments) {
        const source = segment.querySelector("source");
        const target = segment.querySelector("target");
        const srcText = source?.textContent?.trim() || "";
        const tgtText = target?.textContent?.trim() || "";

        if (!srcText || !tgtText) continue;

        const unitId = unit.getAttribute("id") || `xliff2_${total}`;
        let enText: string;
        let arText: string;

        if (isArEn) {
          enText = tgtText;
          arText = srcText;
        } else {
          enText = srcText;
          arText = tgtText;
        }

        entries.push({
          id: unitId,
          type: "translation_memory",
          en: enText,
          ar: arText,
          context: "xliff",
        });

        if (entries.length >= maxEntries) break;
      }

      if (entries.length >= maxEntries) break;
    }
  }

  return { entries, total };
}

// ─── Custom XML Parser ─────────────────────────────────────────────────

/**
 * Parses custom XML by searching for bilingual text nodes.
 *
 * Strategy: Looks for sibling or parent-child pairs of elements where one
 * has a lang attribute containing "en" and the other "ar". Falls back to
 * looking for common patterns like <en>...</en><ar>...</ar> or
 * <source>...</source><target>...</target> within any XML structure.
 *
 * This is a best-effort parser for ad-hoc XML formats.
 */
function parseCustomXML(doc: Document, maxEntries: number): { entries: CorpusEntry[]; total: number } {
  const entries: CorpusEntry[] = [];
  let idCounter = 0;

  // Strategy 1: Look for elements with xml:lang="en" and xml:lang="ar" as siblings
  const langElements = doc.querySelectorAll("[xml\\:lang], [lang]");
  const enTexts: { text: string; parent: Element }[] = [];
  const arTexts: { text: string; parent: Element }[] = [];

  for (const el of langElements) {
    const lang = (el.getAttribute("xml:lang") || el.getAttribute("lang") || "").toLowerCase();
    const text = el.textContent?.trim() || "";
    if (!text) continue;

    if (/^(en|eng)/.test(lang)) {
      enTexts.push({ text, parent: el.parentElement || el });
    } else if (/^(ar|ara)/.test(lang)) {
      arTexts.push({ text, parent: el.parentElement || el });
    }
  }

  // Pair English and Arabic elements that share a parent
  for (const enItem of enTexts) {
    for (const arItem of arTexts) {
      if (enItem.parent === arItem.parent) {
        entries.push({
          id: `custom_${String(++idCounter).padStart(5, "0")}`,
          type: "translation_memory",
          en: enItem.text,
          ar: arItem.text,
          context: "custom",
        });
        break; // One pair per parent
      }
      if (entries.length >= maxEntries) break;
    }
    if (entries.length >= maxEntries) break;
  }

  if (entries.length > 0) return { entries, total: entries.length };

  // Strategy 2: Look for <en>/<ar> or <source>/<target> pattern anywhere
  const enNodes = doc.querySelectorAll("en, english");
  const arNodes = doc.querySelectorAll("ar, arabic");

  if (enNodes.length > 0 && arNodes.length > 0) {
    const pairs = Math.min(enNodes.length, arNodes.length);
    for (let i = 0; i < pairs && entries.length < maxEntries; i++) {
      const enText = enNodes[i]?.textContent?.trim() || "";
      const arText = arNodes[i]?.textContent?.trim() || "";
      if (enText && arText) {
        entries.push({
          id: `custom_${String(++idCounter).padStart(5, "0")}`,
          type: "translation_memory",
          en: enText,
          ar: arText,
          context: "custom",
        });
      }
    }
  }

  if (entries.length > 0) return { entries, total: entries.length };

  // Strategy 3: Look for <source>/<target> pairs (non-XLIFF custom XML)
  const sources = doc.querySelectorAll("source");
  const targets = doc.querySelectorAll("target");

  if (sources.length > 0 && targets.length > 0) {
    const pairs = Math.min(sources.length, targets.length);
    for (let i = 0; i < pairs && entries.length < maxEntries; i++) {
      const enText = sources[i]?.textContent?.trim() || "";
      const arText = targets[i]?.textContent?.trim() || "";
      if (enText && arText) {
        entries.push({
          id: `custom_${String(++idCounter).padStart(5, "0")}`,
          type: "translation_memory",
          en: enText,
          ar: arText,
          context: "custom",
        });
      }
    }
  }

  return { entries, total: entries.length };
}

// ─── Main Parser ───────────────────────────────────────────────────────

/**
 * parseXML — Main entry point for parsing translation XML files.
 *
 * Supports TMX, XLIFF (1.x and 2.x), and custom XML formats.
 * Uses the browser's DOMParser API (available in all modern browsers).
 *
 * @param xmlString - Raw XML content as a string
 * @param fileName - Original file name (for identification in results)
 * @param maxEntries - Maximum entries to extract (default: 5000)
 * @returns XMLParseResult with parsed entries and metadata
 * @throws Error if the XML cannot be parsed by DOMParser
 */
export function parseXML(
  xmlString: string,
  fileName: string = "unknown.xml",
  maxEntries: number = XML_PARSER_MAX_ENTRIES
): XMLParseResult {
  // Use DOMParser (browser-native, no dependencies)
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  // Check for parse errors
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(
      `XML parse error in "${fileName}": ${parseError.textContent?.substring(0, 200) || "Unknown error"}`
    );
  }

  // Detect format
  const format = detectXMLFormat(xmlString);

  let result: { entries: CorpusEntry[]; total: number };

  switch (format) {
    case "tmx":
      result = parseTMX(doc, maxEntries);
      break;
    case "xliff":
      result = parseXLIFF(doc, maxEntries);
      break;
    case "custom":
      result = parseCustomXML(doc, maxEntries);
      break;
    default:
      // Try all parsers in sequence as fallback
      result = parseTMX(doc, maxEntries);
      if (result.entries.length === 0) {
        result = parseXLIFF(doc, maxEntries);
      }
      if (result.entries.length === 0) {
        result = parseCustomXML(doc, maxEntries);
      }
      break;
  }

  const sliced = result.total > maxEntries;

  return {
    entries: result.entries,
    format,
    totalInFile: result.total,
    sliced,
    sliceLimit: maxEntries,
    fileName,
  };
}

// ─── Utility: Parse XML File from Input ────────────────────────────────

/**
 * Parses an XML File object (from <input type="file">) and returns
 * CorpusEntry array suitable for the RAG pipeline.
 *
 * @param file - File object from file input
 * @param maxEntries - Maximum entries to extract
 * @returns Parsed result with entries and metadata
 */
export async function parseXMLFile(
  file: File,
  maxEntries: number = XML_PARSER_MAX_ENTRIES
): Promise<XMLParseResult> {
  const xmlString = await file.text();
  return parseXML(xmlString, file.name, maxEntries);
}
