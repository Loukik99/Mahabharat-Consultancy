import { useEffect } from "react";
import {
  SITE_URL,
  DEFAULT_OG_IMAGE,
  canonicalUrl,
  type PageSeo,
} from "@/config/seo";

type JsonLd = Record<string, unknown> | Record<string, unknown>[];

type SeoProps = PageSeo & {
  /** Extra JSON-LD objects (Organization, Service, BreadcrumbList, etc.) */
  jsonLd?: JsonLd;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(data: JsonLd | undefined) {
  const existing = document.head.querySelectorAll('script[data-seo-jsonld="true"]');
  existing.forEach((n) => n.remove());
  if (!data) return;
  const blocks = Array.isArray(data) ? data : [data];
  for (const block of blocks) {
    // Drop empty sameAs / undefined fields so validators stay clean
    const cleaned = JSON.parse(
      JSON.stringify(block, (_k, v) => (v === undefined || (Array.isArray(v) && v.length === 0) ? undefined : v)),
    );
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo-jsonld", "true");
    script.textContent = JSON.stringify(cleaned);
    document.head.appendChild(script);
  }
}

/**
 * Per-route SEO: title, description, robots, canonical, Open Graph, Twitter, JSON-LD.
 * Updates document head on mount/change (CSR-friendly for History API routes).
 */
export function Seo({
  title,
  description,
  path,
  noindex = false,
  ogType = "website",
  image = DEFAULT_OG_IMAGE,
  jsonLd,
}: SeoProps) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    const url = canonicalUrl(path);
    const robots = noindex ? "noindex, nofollow" : "index, follow";
    const ogImage = image.startsWith("/") ? `${SITE_URL}${image}` : image;

    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", robots);
    upsertMeta("name", "googlebot", robots);
    upsertLink("canonical", url);

    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:type", ogType);
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:site_name", "Mahabharat Consultancy");
    upsertMeta("property", "og:locale", "en_IN");

    upsertMeta("name", "twitter:card", "summary");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", ogImage);

    setJsonLd(jsonLdKey ? (JSON.parse(jsonLdKey) as JsonLd) : undefined);
  }, [title, description, path, noindex, ogType, image, jsonLdKey]);

  return null;
}
