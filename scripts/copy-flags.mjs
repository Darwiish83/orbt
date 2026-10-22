// Copies the country-flag SVGs (flag-icons, MIT) into public/flags so the
// Flag component never fetches from a third-party CDN (CSP: img-src 'self').
// Re-run after upgrading flag-icons: `node scripts/copy-flags.mjs`.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "flag-icons", "flags", "4x3");
const dest = join("public", "flags");
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) if (f.endsWith(".svg")) cpSync(join(src, f), join(dest, f));
console.log(`copied ${readdirSync(dest).length} flags to ${dest}`);
