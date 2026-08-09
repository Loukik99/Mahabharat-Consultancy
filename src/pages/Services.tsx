import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { getServices, getCategories } from "@/api/services.api";
import { serviceCategories, categoryById, serviceCatalog } from "@/data/catalog";
import { serviceIcon, serviceImage } from "@/data/serviceIcons";
import { ServiceCard, type ServiceCardTone } from "@/components/ServiceCard";
import { SectionHeader } from "@/components/SectionHeader";
import { Seo } from "@/components/Seo";
import { digitalSolutions } from "@/data/digitalSolutions";
import {
  pageSeo,
  organizationJsonLd,
  websiteJsonLd,
  webPageJsonLd,
} from "@/config/seo";
import type { Service, ServiceCategory } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Search, SearchX } from "lucide-react";

const TONES: ServiceCardTone[] = ["navy", "emerald", "gold"];
const toneFor = (i: number) => TONES[i % TONES.length];

export default function Services() {
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "all";
  const [search, setSearch] = useState(params.get("q") || "");
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>(serviceCategories);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cats = await getCategories();
        if (active) setCategories(cats);
      } catch {
        if (active) setCategories(serviceCategories);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const d = await getServices(cat, search.trim() || undefined);
        if (active) setServices(d);
      } catch (e) {
        // Offline / API failure: still show static catalog so the page stays crawlable
        let fallback = serviceCatalog.filter((s) => s.isActive !== false);
        if (cat !== "all") fallback = fallback.filter((s) => s.category === cat);
        const q = search.trim().toLowerCase();
        if (q) {
          fallback = fallback.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q),
          );
        }
        if (active) {
          setServices(fallback);
          toast.error((e as Error).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [cat, search]);

  const setCat = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "all") next.delete("cat");
    else next.set("cat", id);
    setParams(next, { replace: true });
  };

  const showDigital = cat === "all" && !search.trim();

  // Category/search query params are filters — canonical always points at /services
  const servicesJsonLd = useMemo(
    () => [organizationJsonLd(), websiteJsonLd(), webPageJsonLd(pageSeo.services)],
    [],
  );

  return (
    <div className="bg-white">
      <Seo {...pageSeo.services} jsonLd={servicesJsonLd} />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <SectionHeader
          eyebrow="What we do"
          title="Our services"
          sub="Browse our government and online services. Pricing is shared on request."
        />

        {/* Search */}
        <div className="relative mt-8 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fog" size={16} />
          <input
            placeholder="Search services…"
            className="h-11 w-full rounded-full border border-mist bg-white pl-10 pr-4 text-[15px] text-ink shadow-subtle placeholder:text-fog transition-colors focus:border-navy/30 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Category chips */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => setCat("all")}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
              cat === "all"
                ? "bg-navy text-white"
                : "border border-mist bg-white text-ink hover:border-navy/25"
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={cn(
                "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
                cat === c.id
                  ? "bg-navy text-white"
                  : "border border-mist bg-white text-ink hover:border-navy/25"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-gold" />
          </div>
        ) : services.length === 0 && !showDigital ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-mist bg-white py-16 text-center shadow-subtle">
            <SearchX size={40} className="mb-3 text-fog/50" />
            <p className="font-medium text-ink">No services found.</p>
            <p className="mt-1 text-sm text-smoke">Try a different category or search term.</p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {showDigital && (
              <ServiceCard
                href={digitalSolutions.href}
                variant="standard"
                tone="gold"
                icon={<img src={digitalSolutions.icon} alt="" className="h-6 w-6" aria-hidden="true" />}
                meta="Digital Solutions"
                title={digitalSolutions.title}
                description={digitalSolutions.oneLiner}
                ctaLabel="Get a quote"
              />
            )}
            {services
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s, i) => {
                const category = categoryById(s.category);
                const img = serviceImage(s.slug);
                const SvcIcon = serviceIcon(s.slug);
                return (
                  <ServiceCard
                    key={s.id}
                    href={`/services/${s.slug || s.id}`}
                    variant="standard"
                    tone={toneFor(i)}
                    icon={img ? <img src={img} alt="" className="h-6 w-6" aria-hidden="true" /> : <SvcIcon size={20} aria-hidden="true" />}
                    meta={category?.name}
                    title={s.name}
                    description={s.description}
                    ctaLabel="View details"
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
