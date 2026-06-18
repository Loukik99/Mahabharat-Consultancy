import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { serviceCategories } from "@/data/catalog";
import { getServices, getCategories } from "@/api/services.api";
import type { Service, ServiceCategory } from "@/types";
import { toast } from "sonner";
import { site, waLink } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText, Receipt, GraduationCap, Printer, Zap, Building2, Sparkles,
  Search, Briefcase, ArrowRight, ArrowUpRight, FileUp, Cog, Download,
  ShieldCheck, Clock, BadgeIndianRupee, Headset, MapPin, Phone, Clock3,
  MessageCircle, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  FileText, Receipt, GraduationCap, Printer, Zap, Building2, Sparkles,
};

const STEPS = [
  { icon: FileText, title: "Submit Request", desc: "Pick a service and tell us what you need." },
  { icon: FileUp, title: "Upload Documents", desc: "Securely share the required documents online." },
  { icon: Cog, title: "We Process It", desc: "Our team handles it on the official portals." },
  { icon: Download, title: "Pay & Download", desc: "Pay, and download once payment is approved." },
];

const WHY = [
  { icon: ShieldCheck, title: "Verified & Trusted", desc: "We use only official government websites." },
  { icon: Clock, title: "Fast Turnaround", desc: "Quick, accurate processing of every request." },
  { icon: BadgeIndianRupee, title: "Transparent", desc: "Clear assistance with no hidden surprises." },
  { icon: Headset, title: "Real Assistance", desc: "Friendly help at every step of the way." },
];

const STATS = [
  { value: "40+", label: "Services" },
  { value: "7", label: "Categories" },
  { value: "100%", label: "Official portals" },
];

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<ServiceCategory[]>(serviceCategories);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [cats, svcs] = await Promise.all([getCategories(), getServices()]);
        if (active) { setCategories(cats); setServices(svcs); }
      } catch (e) {
        if (active) setCategories(serviceCategories);
        toast.error((e as Error).message);
      }
    })();
    return () => { active = false; };
  }, []);

  const popular = services.filter((s) => s.popular).slice(0, 8);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(query.trim() ? `/services?q=${encodeURIComponent(query.trim())}` : "/services");
  };

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="surface-navy relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="max-w-3xl">
            <p className="eyebrow text-gold">{site.tagline}</p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
              All Government &amp; Online Services,
              <span className="block text-gold-gradient">Under One Roof.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              Government documents, GST &amp; tax, exam and job forms, printing, and bill payments —
              prepared and filed for you at one trusted service center in Belagavi.
            </p>

            <form onSubmit={onSearch} className="mt-9 flex w-full max-w-xl gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a service — Aadhaar, PAN, GST, scholarship…"
                  className="h-12 border-transparent bg-white pl-10 text-foreground shadow-lg"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 bg-gold px-6 font-semibold text-gold-foreground hover:bg-gold/90">
                Search
              </Button>
            </form>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/5 text-white backdrop-blur hover:bg-white/10 hover:text-white">
                <Link to="/services">Browse Services <ArrowRight size={16} /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/25 bg-white/5 text-white backdrop-blur hover:bg-white/10 hover:text-white">
                <Link to="/jobs"><Briefcase size={16} /> Government Jobs</Link>
              </Button>
            </div>

            <div className="mt-12 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/10 pt-7">
              {STATS.map((s) => (
                <div key={s.label}>
                  <div className="font-display text-2xl font-semibold text-gold sm:text-3xl">{s.value}</div>
                  <div className="mt-0.5 text-xs uppercase tracking-wider text-white/55">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Categories ───────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="What we do" title="Explore our services" sub="Choose a category to get started." />
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const Icon = ICONS[cat.icon] ?? Sparkles;
            return (
              <Link key={cat.id} to={`/services?cat=${cat.id}`} className="group relative bg-card p-6 transition-colors hover:bg-secondary/50">
                <span className="absolute inset-x-0 top-0 h-0.5 scale-x-0 bg-gold transition-transform duration-300 group-hover:scale-x-100" />
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-navy text-gold">
                    <Icon size={22} />
                  </div>
                  <ArrowUpRight size={18} className="text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-navy">{cat.name}</h3>
                {cat.nameHi && <p className="font-hi text-sm text-muted-foreground">{cat.nameHi}</p>}
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{cat.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Popular ──────────────────────────────────────────── */}
      {popular.length > 0 && (
        <section className="border-y border-border bg-secondary/40">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <p className="eyebrow text-gold">Most requested</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {popular.map((s) => (
                <Link key={s.id} to={`/services/${s.id}`}
                  className="inline-flex items-center gap-2 rounded border border-border bg-card px-4 py-2 text-sm font-medium text-navy transition-colors hover:border-gold hover:text-gold">
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHead eyebrow="The process" title="How it works" sub="Four simple steps from request to delivery." center />
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="font-display text-3xl font-semibold text-gold/40">{String(i + 1).padStart(2, "0")}</span>
                <div className="gold-rule flex-1" />
              </div>
              <div className="mt-4 flex h-11 w-11 items-center justify-center rounded bg-navy text-gold">
                <step.icon size={20} />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-navy">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why choose ───────────────────────────────────────── */}
      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHead eyebrow="Why us" title="Why choose Mahabharat" center />
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((w) => (
              <div key={w.title} className="bg-card p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
                  <w.icon size={22} />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold text-navy">{w.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Disclaimer ───────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded border-l-2 border-gold bg-secondary/60 p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-navy">Disclaimer — </span>
            {site.name} is a private assistance / service center. We are{" "}
            <span className="font-semibold text-navy">not a government agency</span> and do not represent
            UIDAI, the Income Tax Department, GST, or any government portal. For official services we guide
            you to, and work only on, the official government websites.
          </p>
        </div>
      </section>

      {/* ── Contact / visit ──────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <SectionHead eyebrow="Visit us" title="Come in, or reach out" />
            <p className="mt-2 text-sm text-muted-foreground">{site.ownerName}</p>
            <div className="mt-7 space-y-5">
              <ContactRow icon={MapPin}>{site.address}</ContactRow>
              <ContactRow icon={Phone}>
                <a href={`tel:${site.phone.replace(/\s+/g, "")}`} className="hover:text-gold">{site.phone}</a>
              </ContactRow>
              <ContactRow icon={Clock3}>{site.workingHours}</ContactRow>
            </div>
            <Button asChild size="lg" className="mt-7 bg-[#1FA855] text-white hover:bg-[#178a46]">
              <a href={waLink(`Hello ${site.name}, I would like to know about your services.`)} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={18} /> Chat on WhatsApp
              </a>
            </Button>
          </div>
          <div className="overflow-hidden rounded border border-border shadow-sm">
            <iframe
              title={`${site.name} location map`}
              src={site.mapEmbedUrl}
              className="h-full min-h-[320px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHead({ eyebrow, title, sub, center }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? "text-center" : ""}>
      <p className="eyebrow text-gold">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-navy sm:text-4xl">{title}</h2>
      {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ContactRow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-secondary/60 text-gold">
        <Icon size={16} />
      </span>
      <p className="pt-1.5 text-sm text-foreground">{children}</p>
    </div>
  );
}
