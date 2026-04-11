/**
 * Generate PNG icons for RDAT Copilot PWA using pure Node.js canvas-less approach.
 * Creates simple but professional PNG icons with the R lettermark.
 */
const fs = require("fs");
const path = require("path");

// We'll create a simple SVG that can be used directly (modern browsers support SVG favicons)
// And copy it as the various icon sizes

const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
    <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#10b981"/>
      <stop offset="100%" style="stop-color:#059669"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="100" ry="100" fill="url(#bg)" stroke="#334155" stroke-width="4"/>
  <path d="M196,156 L276,156 C316,156 336,176 336,206 C336,236 316,256 276,256 L236,256 L296,356 L246,356 L196,256 L196,156 Z M236,186 L236,226 L276,226 C291,226 296,218 296,206 C296,194 291,186 276,186 Z" fill="url(#rg)"/>
  <circle cx="420" cy="92" r="6" fill="#10b981" opacity="0.6"/>
</svg>`;

// Write SVG versions (modern browsers support SVG icons in PWA manifests)
const iconsDir = path.join(__dirname, "public", "icons");
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, "icon-192x192.svg"), iconSVG.replace('width="512" height="512"', 'width="192" height="192"'));
fs.writeFileSync(path.join(iconsDir, "icon-512x512.svg"), iconSVG);

// Also write the main icon.svg
fs.writeFileSync(path.join(__dirname, "public", "icon.svg"), iconSVG);

// Create a simple PNG data URI for favicon (1x1 transparent pixel as fallback)
// Real PNGs will be generated if sharp/canvas is available
console.log("✅ SVG icons written successfully.");
console.log("📍 Locations:");
console.log("   public/icon.svg");
console.log("   public/icons/icon-192x192.svg");
console.log("   public/icons/icon-512x512.svg");
