import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { serviceCategories } from "@/data/catalog";
import { getServices, getCategories } from "@/api/services.api";
import type { Service, ServiceCategory } from "@/types";
import { toast } from "sonner";
import { site, waLink } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Receipt,
  GraduationCap,
  Printer,
  Zap,
  Building2,
  Sparkles,
  Search,
  Briefcase,
  ArrowRight,
  FileUp,
  Cog,
  Download,
  ShieldCheck,
  Clock,
  BadgeIndianRupee,
  Headset,
  MapPin,
  Phone,
  Clock3,
  MessageCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  FileText,
  Receipt,
  GraduationCap,
  Printer,
  Zap,
  Building2,
  Sparkles,
};

const STEPS = [
  { icon: FileText, title: "Submit Request", desc: "Pick a service and tell us what you need." },
  { icon: FileUp, title: "Upload Documents", desc: "Securely share the required documents online." },
  { icon: Cog, title: "We Do The Work", desc: "Our team processes it on the official portals." },
  { icon: Download, title: "Pay & Download", desc: "Pay and download once payment is approved." },
];

const WHY = [
  { icon: ShieldCheck, title: "Verified & Trusted", desc: "We use only official government websites." },
  { icon: Clock, title: "Fast Turnaround", desc: "Quick, accurate processing of every request." },
  { icon: BadgeIndianRupee, title: "Transparent", desc: "Clear assistance with no hidden surprises." },
  { icon: Headset, title: "Assistance Center", desc: "Friendly help at every step of the way." },
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
        if (active) {
          setCategories(cats);
          setServices(svcs);
        }
      } catch (e) {
        // Fall back to static categories for icon metadata.
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
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#4f8ef7] to-[#6c63ff] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <Badge className="mb-5 border-transparent bg-white/15 text-white hover:bg-white/20">
            {site.name} &bull; {site.tagline}
          </Badge>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            All Government &amp; Online Services Under One Roof
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 sm:text-lg">
            Government documents, Tax &amp; GST, Exams &amp; Jobs, Printing, Bills &amp; Recharge —
            handled for you at one friendly service center.
          </p>

          <form onSubmit={onSearch} className="mt-7 flex w-full max-w-xl gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a service (Aadhaar, PAN, GST, scholarship…)"
                className="h-11 bg-white pl-9 text-foreground"
              />
            </div>
            <Button type="submit" size="lg" className="h-11 bg-white text-blue-600 hover:bg-white/90">
              Search
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-white/90">
              <Link to="/services">
                Browse Services <ArrowRight size={16} />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/60 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link to="/jobs">
                <Briefcase size={16} /> Government Jobs
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Explore Our Services</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose a category to get started.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const Icon = ICONS[cat.icon] ?? Sparkles;
            return (
              <Link key={cat.id} to={`/services?cat=${cat.id}`} className="group">
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg">
                  <div className={`bg-gradient-to-br ${cat.accent} p-5 text-white`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/20">
                        <Icon size={22} />
                      </div>
                      <div>
                        <h3 className="font-semibold leading-tight">{cat.name}</h3>
                        {cat.nameHi && <p className="text-xs text-white/85">{cat.nameHi}</p>}
                      </div>
                    </div>
                  </div>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">{cat.description}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 transition-all group-hover:gap-2">
                      View services <ArrowRight size={14} />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Popular services */}
      {popular.length > 0 && (
        <section className="bg-muted/40">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <h2 className="mb-6 text-2xl font-bold tracking-tight">Popular Services</h2>
            <div className="flex flex-wrap gap-3">
              {popular.map((s) => (
                <Link
                  key={s.id}
                  to={`/services/${s.id}`}
                  className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:border-blue-500 hover:text-blue-600"
                >
                  <Sparkles size={14} className="text-blue-500" />
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight">How It Works</h2>
          <p className="mt-1 text-sm text-muted-foreground">Four simple steps from request to delivery.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="h-full">
              <CardContent className="pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f8ef7] to-[#6c63ff] text-white">
                  <step.icon size={22} />
                </div>
                <span className="mt-4 inline-block text-xs font-bold text-blue-600">STEP {i + 1}</span>
                <h3 className="mt-1 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Why choose us */}
      <section className="bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight">Why Choose Us</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((w) => (
              <Card key={w.title} className="h-full text-center">
                <CardContent className="pt-6">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <w.icon size={22} />
                  </div>
                  <h3 className="mt-3 font-semibold">{w.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{w.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Legal disclaimer */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900">
          <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">Disclaimer: </span>
            {site.name} is a private assistance / service center. We are{" "}
            <span className="font-semibold">NOT a government agency</span> and do not represent UIDAI,
            Income Tax Department, GST, or any government portal. For official services we guide you to
            and use only the official government websites.
          </p>
        </div>
      </section>

      {/* Contact / visit */}
      <section className="bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Visit or Contact Us</h2>
              <p className="mt-1 text-sm text-muted-foreground">{site.ownerName}</p>

              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="mt-0.5 shrink-0 text-blue-600" />
                  <p className="text-sm">{site.address}</p>
                </div>
                <div className="flex items-start gap-3">
                  <Phone size={20} className="mt-0.5 shrink-0 text-blue-600" />
                  <a href={`tel:${site.phone.replace(/\s+/g, "")}`} className="text-sm hover:text-blue-600">
                    {site.phone}
                  </a>
                </div>
                <div className="flex items-start gap-3">
                  <Clock3 size={20} className="mt-0.5 shrink-0 text-blue-600" />
                  <p className="text-sm">{site.workingHours}</p>
                </div>
              </div>

              <Button asChild size="lg" className="mt-6 bg-green-600 hover:bg-green-700">
                <a
                  href={waLink(`Hello ${site.name}, I would like to know about your services.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={18} /> Chat on WhatsApp
                </a>
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border shadow-sm">
              <iframe
                title={`${site.name} location map`}
                src={site.mapEmbedUrl}
                className="h-72 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
