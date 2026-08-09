/**
 * Generates public/sitemap.xml from the static service catalog + public routes.
 * Run via: node scripts/generate-sitemap.mjs  (also hooked into npm prebuild)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "src", "data", "catalog.ts");
const outPath = path.join(root, "public", "sitemap.xml");

const SITE = "https://mahabharat.net.in";

const staticPaths = [
  { loc: "/", changefreq: "weekly", priority: "1.0" },
  { loc: "/services", changefreq: "weekly", priority: "0.9" },
  { loc: "/digital-solutions", changefreq: "monthly", priority: "0.8" },
  { loc: "/jobs", changefreq: "daily", priority: "0.8" },
];

const catalogSrc = fs.readFileSync(catalogPath, "utf8");
const slugRe = /svc\(\s*"([a-z0-9-]+)"/g;
const slugs = [];
let m;
while ((m = slugRe.exec(catalogSrc)) !== null) {
  if (!slugs.includes(m[1])) slugs.push(m[1]);
}

const today = new Date().toISOString().slice(0, 10);

function urlEntry(loc, changefreq, priority) {
  const href = loc === "/" ? `${SITE}/` : `${SITE}${loc}`;
  return `  <url>
    <loc>${href}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

const entries = [
  ...staticPaths.map((p) => urlEntry(p.loc, p.changefreq, p.priority)),
  ...slugs.map((slug) => urlEntry(`/services/${slug}`, "monthly", "0.7")),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, xml, "utf8");
console.log(`Wrote ${entries.length} URLs to ${path.relative(root, outPath)}`);
