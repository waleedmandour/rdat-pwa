/**
 * getAssetUrl — Resolves a public asset path with the correct base path prefix.
 *
 * When deploying to a sub-path (e.g., GitHub Pages at /rdat-pwa/), absolute
 * paths like "/data/default-corpus-en-ar.json" resolve to the domain root and 404.
 * This utility reads Next.js's basePath from the runtime __NEXT_DATA__ and
 * prepends it so fetch() calls work correctly in both Web Workers and the
 * main thread.
 *
 * Usage:
 *   getAssetUrl("/data/default-corpus-en-ar.json")
 *   // → "/rdat-pwa/data/default-corpus-en-ar.json" on GitHub Pages
 *   // → "/data/default-corpus-en-ar.json" on Vercel (root)
 *
 * For Web Workers: call this in the main thread and pass the resolved URL
 * to the worker via postMessage (workers don't have access to __NEXT_DATA__).
 */
export function getAssetUrl(path: string): string {
  if (typeof window === "undefined") return path;

  // Next.js injects the basePath into the page's __NEXT_DATA__ script tag
  const nextData = (window as unknown as { __NEXT_DATA__?: { basePath?: string } }).__NEXT_DATA__;
  const basePath = nextData?.basePath || "";

  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${basePath}${normalizedPath}`;
}
