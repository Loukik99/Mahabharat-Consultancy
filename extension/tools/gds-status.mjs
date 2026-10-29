/**
 * One polite status check of the official India Post GDS pages.
 *   node extension/tools/gds-status.mjs [--force]
 *
 * Sends a single unauthenticated GET to each page below, with no retries, no cookies and no
 * form submission, then prints what the pages say about the registration window.
 * Refuses to run again within 6 hours unless --force is given, so the portal is never hammered.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PAGES = [
  { id: "notice", url: "https://www.indiapost.gov.in/gdsonlineengagement" },
  { id: "candidate", url: "https://gdsrect.indiapost.gov.in/gdscandidate" },
];
const MIN_GAP_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 20000;
const STAMP = path.join(os.tmpdir(), "mc-gds-status-last-run.json");

const force = process.argv.includes("--force");
const now = new Date();

function lastRun() {
  try {
    return JSON.parse(fs.readFileSync(STAMP, "utf8"));
  } catch {
    return null;
  }
}

const prev = lastRun();
if (!force && prev?.at && now - new Date(prev.at) < MIN_GAP_MS) {
  const next = new Date(new Date(prev.at).getTime() + MIN_GAP_MS);
  console.log(JSON.stringify({ skipped: true, reason: "checked less than 6 hours ago", lastCheckedAt: prev.at, nextAllowedAt: next.toISOString(), lastResult: prev.result ?? null }, null, 2));
  process.exit(0);
}
fs.writeFileSync(STAMP, JSON.stringify({ at: now.toISOString() }));

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*";
const DATE = new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?[\\s.\\-/](?:${MONTH}|\\d{1,2})[\\s.,\\-/]+\\d{4})\\b`, "gi");

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function analyse(html) {
  const text = textOf(html);
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
  const closed = text.match(/registration[^.]{0,80}\b(?:is |has been |now )?closed\b[^.]{0,80}/i)?.[0] || null;
  const openHint = text.match(/\b(?:register now|new registration|apply online|registration (?:is )?open)\b[^.]{0,60}/i)?.[0] || null;
  const schedule = text.match(/schedule[\s-]*[ivx]+[^.]{0,40}\d{4}/i)?.[0] || null;
  const dated = [];
  for (const m of text.matchAll(DATE)) {
    const start = Math.max(0, m.index - 90);
    dated.push(text.slice(start, m.index + m[0].length + 30).trim());
    if (dated.length >= 12) break;
  }
  return { title, schedule, closedText: closed, openHint, dateContexts: dated, textLength: text.length };
}

async function getOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      credentials: "omit",
      headers: { Accept: "text/html", "User-Agent": "MahabharatConsultancy-GDS-status-check/1 (single manual check)" },
    });
    const html = res.ok ? await res.text() : "";
    return { httpStatus: res.status, finalUrl: res.url.split(/[?#]/)[0], ...(res.ok ? analyse(html) : {}) };
  } catch (e) {
    return { httpStatus: null, error: e.name === "AbortError" ? `no response within ${TIMEOUT_MS / 1000}s` : String(e.cause?.code || e.message).slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}

const pages = {};
for (const p of PAGES) pages[p.id] = { url: p.url, ...(await getOnce(p.url)) };

const anyClosed = Object.values(pages).some((p) => p.closedText);
const anyOpen = Object.values(pages).some((p) => p.openHint && !p.closedText);
const reachable = Object.values(pages).some((p) => p.httpStatus === 200);
const status = !reachable ? "unreachable" : anyClosed ? "registration-closed" : anyOpen ? "possibly-open-check-manually" : "unknown-check-manually";
const result = { checkedAt: now.toISOString(), status, pages };

fs.writeFileSync(STAMP, JSON.stringify({ at: now.toISOString(), result: { status, checkedAt: result.checkedAt } }));
console.log(JSON.stringify(result, null, 2));
