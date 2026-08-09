/**
 * GitHub Pages has no SPA rewrite — copy index.html to 404.html so deep
 * links (e.g. /services/pan-card) serve the app shell instead of a hard 404.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "index.html");
const fallback = path.join(dist, "404.html");

if (!fs.existsSync(index)) {
  console.error("dist/index.html missing — run vite build first");
  process.exit(1);
}

fs.copyFileSync(index, fallback);
console.log("Copied dist/index.html → dist/404.html (SPA fallback for GitHub Pages)");
