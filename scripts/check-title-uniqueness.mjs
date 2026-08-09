import fs from "node:fs";

const catalog = fs.readFileSync("src/data/catalog.ts", "utf8");
const entries = [...catalog.matchAll(/svc\(\s*"([a-z0-9-]+)"\s*,\s*"([^"]+)"/g)].map((m) => ({
  slug: m[1],
  name: m[2],
}));

const titles = new Map();
for (const e of entries) {
  const short = e.name.replace(/\s+Assistance$/i, "").trim();
  const title = `${short} | Mahabharat Consultancy`;
  if (titles.has(title)) console.log("DUP", title);
  titles.set(title, e.slug);
}

console.log({
  services: entries.length,
  uniqueTitles: titles.size,
  epfo: [...titles.keys()].find((t) => /epfo/i.test(t)),
});
