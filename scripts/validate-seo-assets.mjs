import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const xml = fs.readFileSync(path.join(root, "public", "sitemap.xml"), "utf8");
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const checks = {
  count: urls.length,
  home: urls.includes("https://mahabharat.net.in/"),
  epfo: urls.includes("https://mahabharat.net.in/services/epfo-services"),
  pan: urls.includes("https://mahabharat.net.in/services/pan-card"),
  login: urls.some((u) => u.includes("/login")),
  admin: urls.some((u) => u.includes("/admin")),
  allProd: urls.every((u) => u.startsWith("https://mahabharat.net.in")),
  noLocalhost: !urls.some((u) => /localhost|127\.0\.0\.1/.test(u)),
  distRobots: fs.existsSync(path.join(root, "dist", "robots.txt")),
  distSitemap: fs.existsSync(path.join(root, "dist", "sitemap.xml")),
  dist404: fs.existsSync(path.join(root, "dist", "404.html")),
};

console.log(JSON.stringify(checks, null, 2));
if (checks.count < 50 || !checks.home || !checks.epfo || checks.login || checks.admin || !checks.allProd) {
  process.exit(1);
}
