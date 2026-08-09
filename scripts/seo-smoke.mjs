/**
 * Smoke-test static SEO assets + History API shell responses via preview server.
 */
const base = process.env.SEO_BASE || "http://127.0.0.1:4173";

async function check(path, expect) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const text = path.endsWith(".xml") || path.endsWith(".txt") || path.endsWith(".html") || path === "/" || !path.includes(".")
    ? await res.text()
    : "";
  const row = {
    path,
    status: res.status,
    ...expect(res, text),
  };
  console.log(JSON.stringify(row));
  return row;
}

const results = [];

results.push(
  await check("/robots.txt", (_r, t) => ({
    hasSitemap: t.includes("Sitemap: https://mahabharat.net.in/sitemap.xml"),
    blocksAdmin: t.includes("Disallow: /admin"),
    allowsRoot: /Allow:\s*\//.test(t),
  })),
);

results.push(
  await check("/sitemap.xml", (_r, t) => ({
    isXml: t.includes("<urlset"),
    hasEpfo: t.includes("/services/epfo-services"),
    noLogin: !t.includes("/login"),
  })),
);

results.push(
  await check("/og-image.jpeg", (r) => ({
    ok: r.status === 200,
    type: r.headers.get("content-type"),
  })),
);

for (const path of ["/", "/services", "/services/epfo-services", "/jobs", "/digital-solutions", "/login", "/admin"]) {
  results.push(
    await check(path, (r, t) => ({
      spaShell: t.includes('<div id="root"></div>'),
      hasDefaultTitle: t.includes("Mahabharat Consultancy"),
      hasCanonical: t.includes('rel="canonical"'),
      hasViewport: t.includes("viewport"),
    })),
  );
}

const failed = results.filter((r) => r.status >= 400 || r.ok === false || r.hasSitemap === false || r.isXml === false);
if (failed.length) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("SEO smoke checks passed");
