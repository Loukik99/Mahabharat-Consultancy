import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { serviceCategories, serviceCatalog, serviceById } from "@/data/catalog";
import { getServices, getCategories } from "@/api/services.api";
import type { Service, ServiceCategory } from "@/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FaqAccordion } from "@/components/FaqAccordion";
import { SectionHeader } from "@/components/SectionHeader";
import { ServiceExplorerCard, type ExplorerCardSize, type ExplorerCardTone } from "@/components/ServiceExplorerCard";
import { JourneyTimeline } from "@/components/JourneyTimeline";
import { TrustMetricsBar } from "@/components/TrustMetricsBar";
import { HomeCta } from "@/components/HomeCta";
import { Pill } from "@/components/Pill";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Seo } from "@/components/Seo";
import { pageSeo, organizationJsonLd, websiteJsonLd, webPageJsonLd } from "@/config/seo";
import { digitalSolutions } from "@/data/digitalSolutions";
import {
  FileText, Receipt, GraduationCap, Zap, Building2, Truck,
  Search, Briefcase, ArrowRight, Cog, Landmark, Check, HandCoins,
  type LucideIcon,
} from "lucide-react";

// Uniform equal-height service explorer grid. Every card uses the same
// size tier and column span so the layout stays balanced across rows.
interface ExplorerCardConfig {
  id: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  size: ExplorerCardSize;
  tone: ExplorerCardTone;
  ctaLabel?: string;
  /** When set, Home resolves this catalog slug to the live Mongo service id. */
  serviceSlug?: string;
  /** Static quick items for cards that aren't backed by a live category. */
  staticQuick?: string[];
}

const EXPLORER_CARDS: ExplorerCardConfig[] = [
  {
    id: "govt_docs",
    href: "/services?cat=govt_docs",
    icon: FileText,
    title: "Government Documents",
    description: "Aadhaar, PAN, Voter ID, Passport and certificates, prepared and filed for you on the official portals.",
    size: "standard",
    tone: "navy",
    ctaLabel: "Explore documents",
  },
  {
    id: "exams_jobs",
    href: "/services?cat=exams_jobs",
    icon: GraduationCap,
    title: "Exams & Jobs",
    description: "Scholarships, admissions, exam forms, results and government job applications.",
    size: "standard",
    tone: "gold",
  },
  {
    id: "epfo",
    href: "/services/epfo-services",
    serviceSlug: "epfo-services",
    icon: HandCoins,
    title: "EPFO",
    description: "EPFO claims, withdrawals, KYC updates, UAN activation, pension assistance and related services.",
    size: "standard",
    tone: "emerald",
    staticQuick: ["Claims & withdrawals", "UAN activation", "KYC updates"],
  },
  {
    id: "tax_gst",
    href: "/services?cat=tax_gst",
    icon: Receipt,
    title: "Tax & GST",
    description: "GST registration, returns, ITR filing and e-way bills, handled by people who know the portals.",
    size: "standard",
    tone: "emerald",
  },
  {
    id: "eway-bill",
    href: "/services/eway-bill",
    serviceSlug: "eway-bill",
    icon: Truck,
    title: "E-Way Bill",
    description: "Generate and manage e-way bills for goods transport, ready in minutes.",
    size: "standard",
    tone: "gold",
    ctaLabel: "Generate e-way bill",
  },
  {
    id: "pmegp",
    href: "/services/pmegp",
    serviceSlug: "pmegp",
    icon: Briefcase,
    title: "PMEGP",
    description: "Prime Minister's Employment Generation Programme for eligible individuals seeking assistance to establish new micro-enterprises and self-employment ventures.",
    size: "standard",
    tone: "navy",
    staticQuick: ["New micro-enterprises", "Self-employment", "Official PMEGP portal"],
  },
  {
    id: "bills_recharge",
    href: "/services?cat=bills_recharge",
    icon: Zap,
    title: "Bills & Recharge",
    description: "Electricity, water, mobile, DTH and FASTag, paid and recharged on the spot.",
    size: "standard",
    tone: "gold",
  },
  {
    id: "__digital__",
    href: digitalSolutions.href,
    icon: Cog,
    title: digitalSolutions.title,
    description: digitalSolutions.oneLiner,
    size: "standard",
    tone: "navy",
    ctaLabel: "Get a quote",
    staticQuick: ["Websites", "Mobile apps", "E-commerce", "Custom software"],
  },
  {
    id: "business",
    href: "/services?cat=business",
    icon: Building2,
    title: "Business Registration",
    description: "Company registration and online seller onboarding, from paperwork to approval.",
    size: "standard",
    tone: "navy",
  },
];

// Hero trust indicators: rendered as inline checkmark badges rather than
// a stat-card grid (separate from the Trust Metrics Bar further down).
const HERO_TRUST = [
  { label: "Services", value: "40+" },
  { label: "Official portals", value: "100%" },
  { label: "Assistance", value: "Same-day" },
];

// Hero workspace — suggested services shown as quick-action chips below
// the search bar. Clicking one jumps straight into the service search.
const SUGGESTED_SERVICES = ["Aadhaar", "PAN", "Passport", "GST"];

const FAQS = [
  {
    q: "Is Mahabharat Consultancy a government office?",
    a: "No. We are a private assistance and service center. We help you apply correctly on official government portals, and we never represent UIDAI, the Income Tax Department, GST, or any government body.",
  },
  {
    q: "How do I track my request?",
    a: "Once you submit a request from your dashboard, it moves through a visible status timeline: submitted, documents required, in review, in progress, waiting for payment, and completed, updated as our team works on it.",
  },
  {
    q: "When do I pay, and when can I download my documents?",
    a: "Pricing is confirmed with you before we start. Final deliverables unlock for download only after your payment is recorded and approved, you're never charged for work you haven't agreed to.",
  },
  {
    q: "What documents do I need to upload?",
    a: "Each service lists its own required-documents checklist on its detail page. You upload them securely from your dashboard once your request is created.",
  },
  {
    q: "Can I get help the same day?",
    a: "Most walk-in and online requests receive same-day assistance during working hours. More involved government processing times depend on the official portal, not on us.",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<ServiceCategory[]>(serviceCategories);
  const [services, setServices] = useState<Service[]>(serviceCatalog);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [cats, svcs] = await Promise.all([getCategories(), getServices()]);
        if (active) { setCategories(cats); setServices(svcs); }
      } catch (e) {
        if (active) { setCategories(serviceCategories); setServices(serviceCatalog); }
        toast.error((e as Error).message);
      }
    })();
    return () => { active = false; };
  }, []);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(query.trim() ? `/services?q=${encodeURIComponent(query.trim())}` : "/services");
  };

  return (
    <div>
      <Seo
        {...pageSeo.home}
        jsonLd={[organizationJsonLd(), websiteJsonLd(), webPageJsonLd(pageSeo.home)]}
      />
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white">
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 sm:pb-28 sm:pt-14 lg:px-8">
          <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20">
            {/* Left — headline, CTAs, trust indicators */}
            <div className="min-w-0 max-w-xl">
              <Pill tone="outline">
                <Landmark size={12} className="text-navy" /> Trusted service center · Belagavi, Karnataka
              </Pill>

              <h1 className="font-display mt-6 text-[clamp(1.85rem,8.2vw,2.5rem)] font-extrabold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[3.1rem] lg:text-[3.4rem]">
                All government &amp; online services,
                <span className="block text-navy">under one roof.</span>
              </h1>

              <p className="mt-6 max-w-lg text-[16px] leading-[1.65] text-smoke sm:text-[17px]">
                Government documents, GST and tax, exam and job forms, printing, and bill payments,
                all prepared and filed for you at one trusted service center in Belagavi.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full bg-navy px-6 font-semibold text-white shadow-subtle hover:bg-navy/90">
                  <Link to="/services">Browse Services <ArrowRight size={16} /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full border-mist bg-white text-ink hover:bg-ink/[0.03] hover:text-ink">
                  <Link to="/jobs"><Briefcase size={16} /> Government Jobs</Link>
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-mist pt-7">
                {HERO_TRUST.map((t) => (
                  <div key={t.label} className="flex items-center gap-2">
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-soft text-emerald">
                      <Check size={11} strokeWidth={3} />
                    </span>
                    <span className="text-[13.5px] text-ink">
                      <span className="font-bold">{t.value}</span>{" "}
                      <span className="text-smoke">{t.label}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — the search experience: just the search bar and its
                suggested-service chips, no surrounding card/box. */}
            <div className="min-w-0 w-full">
              <p className="font-display text-[19px] font-bold text-ink sm:text-[21px]">What are you looking for today?</p>

              <form
                onSubmit={onSearch}
                className="mt-4 flex items-center gap-2 rounded-[22px] border border-mist bg-white py-2 pl-4 pr-2 shadow-subtle transition-colors duration-300 focus-within:border-navy/30 sm:pl-5"
              >
                <Search className="shrink-0 text-fog" size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Aadhaar, PAN, GST, Passport…"
                  className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-fog focus:outline-none sm:text-[15px]"
                />
                <Button type="submit" className="h-11 shrink-0 rounded-full bg-navy px-4 text-[13px] font-semibold text-white hover:bg-navy/90 sm:px-6 sm:text-[14px]">
                  Search
                </Button>
              </form>

              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-fog">Suggested services</p>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {SUGGESTED_SERVICES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => navigate(`/services?q=${encodeURIComponent(s)}`)}
                      className="cursor-pointer rounded-full border border-mist bg-white px-4 py-2.5 text-[13.5px] font-medium text-ink transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-gold/70 hover:shadow-subtle"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Services — the premium service explorer ──────────── */}
      <section className="bg-snow">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <ScrollReveal direction="left">
            <SectionHeader
              align="center"
              title="Our services"
              sub="Every category is one tap away from its full checklist, official links and quick services. Pick what you need and we take it from there."
            />
          </ScrollReveal>
          <div className="mt-14 grid grid-cols-1 items-stretch gap-6 [grid-auto-rows:minmax(18rem,auto)] sm:grid-cols-2 sm:gap-5 sm:[grid-auto-rows:22rem] lg:grid-cols-3 lg:gap-6">
            {EXPLORER_CARDS.map((card, i) => {
              const maxQuick = 3;
              const liveService = card.serviceSlug
                ? services.find((s) => s.slug === card.serviceSlug)
                : undefined;
              const href = liveService ? `/services/${liveService.id}` : card.href;
              const quick =
                card.serviceSlug === "eway-bill"
                  ? (liveService?.requiredDocuments ?? serviceById("eway-bill")?.requiredDocuments ?? []).slice(0, maxQuick)
                  : card.staticQuick
                  ? card.staticQuick.slice(0, maxQuick)
                  : services.filter((s) => s.category === card.id).slice(0, maxQuick).map((s) => s.name);
              return (
                <ScrollReveal key={card.id} index={i} className="min-h-0 h-full w-full">
                  <ServiceExplorerCard
                    href={href}
                    size="standard"
                    tone={card.tone}
                    className="min-h-0 h-full w-full"
                    icon={
                      card.id === "__digital__" ? (
                        <img src={digitalSolutions.icon} alt="" className="h-6 w-6" aria-hidden="true" />
                      ) : (
                        <card.icon size={20} />
                      )
                    }
                    title={card.title}
                    description={card.description}
                    quickItems={quick}
                    ctaLabel={card.ctaLabel}
                  />
                </ScrollReveal>
              );
            })}
          </div>
          <ScrollReveal direction="right" className="mt-10 text-center">
            <Button asChild size="lg" className="rounded-full bg-navy px-7 font-semibold text-white hover:bg-navy/90">
              <Link to="/services">Browse all services <ArrowRight size={16} /></Link>
            </Button>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Trust metrics bar ───────────────────────────────────── */}
      <TrustMetricsBar />

      {/* ── How it works: scroll-driven journey timeline ───────── */}
      <JourneyTimeline />

      {/* ── Call to action: visit us / reach us now ─────────────── */}
      <HomeCta />

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <ScrollReveal direction="left">
            <SectionHeader align="center" eyebrow="Questions" title="Frequently asked questions" />
          </ScrollReveal>
          <ScrollReveal direction="right" className="mt-14">
            <FaqAccordion items={FAQS} />
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
