import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText, Home as HomeIcon, Sparkles, Users, ShoppingCart,
  ArrowRight, ShieldCheck, Clock, IndianRupee, Star, Headphones,
  Search, Zap, Award, ChevronRight, Phone, CreditCard,
  Building2, Landmark, BadgeCheck, FileCheck, Car, GraduationCap,
  Briefcase, Store, Receipt, Globe, CircleUserRound, MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import logoImg from "@/assets/logo.jpeg";

/* ═══════════ G2C — Government to Citizen Services ═══════════ */
const g2cServices = [
  { id: "s1", name: "Aadhar Card", icon: BadgeCheck, color: "#2563eb", bg: "#eff6ff" },
  { id: "s2", name: "PAN Card", icon: CreditCard, color: "#0891b2", bg: "#ecfeff" },
  { id: "s3", name: "Passport", icon: Globe, color: "#7c3aed", bg: "#f5f3ff" },
  { id: "s4", name: "Driving License", icon: Car, color: "#059669", bg: "#ecfdf5" },
  { id: "s5", name: "Income Certificate", icon: FileCheck, color: "#d97706", bg: "#fffbeb" },
  { id: "s6", name: "Caste Certificate", icon: FileText, color: "#dc2626", bg: "#fef2f2" },
];

/* ═══════════ B2C — Business to Citizen Services ═══════════ */
const b2cServices = [
  { key: "home", name: "Home Services", icon: HomeIcon, color: "#059669", bg: "#ecfdf5", count: 4 },
  { key: "housekeeping", name: "Housekeeping", icon: Sparkles, color: "#7c3aed", bg: "#f5f3ff", count: 3 },
  { key: "manpower", name: "Manpower Supply", icon: Users, color: "#d97706", bg: "#fffbeb", count: 3 },
  { key: "ecommerce", name: "E-Commerce", icon: ShoppingCart, color: "#dc2626", bg: "#fef2f2", count: 3 },
];

const g2cSubServices: Record<string, string[]> = {
  "s1": ["New Enrollment", "Correction", "Update Address"],
  "s2": ["New PAN", "Correction", "e-PAN Download"],
  "s3": ["Fresh Passport", "Renewal", "Tatkal"],
  "s4": ["New License", "Renewal", "Duplicate"],
  "s5": ["Income Certificate", "Domicile", "EWS Certificate"],
  "s6": ["Caste Certificate", "Non-Creamy Layer", "Tribe Certificate"],
};

const b2cSubServices: Record<string, string[]> = {
  "home": ["AC Repair", "Plumbing", "Electrician", "Painting"],
  "housekeeping": ["Deep Cleaning", "Office Cleaning", "Pest Control"],
  "manpower": ["Security Guard", "Office Boy", "Cook / Chef"],
  "ecommerce": ["Amazon Seller Setup", "Flipkart Seller", "GST Registration"],
};

const stats = [
  { value: "10,000+", label: "Citizens Served", icon: CircleUserRound },
  { value: "19+", label: "Services Available", icon: Zap },
  { value: "4.9/5", label: "Satisfaction Rating", icon: Star },
  { value: "24/7", label: "Customer Support", icon: Headphones },
];

const quickLinks = [
  { name: "Aadhar Card", to: "/services?category=government", icon: BadgeCheck, color: "#2563eb" },
  { name: "PAN Card", to: "/services?category=government", icon: CreditCard, color: "#0891b2" },
  { name: "AC Repair", to: "/services?category=home", icon: HomeIcon, color: "#059669" },
  { name: "Deep Cleaning", to: "/services?category=housekeeping", icon: Sparkles, color: "#7c3aed" },
  { name: "GST Registration", to: "/services?category=ecommerce", icon: Receipt, color: "#d97706" },
  { name: "Passport", to: "/services?category=government", icon: Globe, color: "#7c3aed" },
];

export default function HomePage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const [activeG2C, setActiveG2C] = useState<string | null>(null);
  const [activeB2C, setActiveB2C] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/services?search=${encodeURIComponent(search)}`);
  };

  return (
    <div className="bg-[#f8fafc] min-h-screen">
      {/* ═══════════ HERO BANNER — Bright Premium ═══════════ */}
      <section className="relative bg-gradient-to-br from-[#4f8ef7] via-[#6c63ff] to-[#38bdf8] overflow-hidden">
        {/* Soft radial glow */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }} />
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-[20%] w-80 h-80 bg-amber-300/10 rounded-full blur-[100px]" />
        <div className="absolute top-[30%] left-0 w-60 h-60 bg-emerald-300/10 rounded-full blur-[80px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/15 border border-white/20 rounded-full px-4 py-1.5 mb-6 text-xs text-white font-semibold shadow-sm backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                Your Trusted One Stop Service Center
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-[48px] font-bold text-white leading-[1.12] tracking-tight drop-shadow-sm">
                All Government &<br />
                <span className="text-amber-200">Digital Services</span><br />
                Under One Roof
              </h1>
              <p className="mt-5 text-white/80 text-[15px] leading-relaxed max-w-md">
                Access Government-to-Citizen (G2C) and Business-to-Citizen (B2C) services. Apply for documents, book home services, and manage everything from one platform.
              </p>
              {/* Search */}
              <form onSubmit={handleSearch} className="mt-7 flex gap-2 max-w-md">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input placeholder="Search services... (e.g. PAN Card, Plumbing)" value={search} onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-12 bg-white border-0 text-gray-900 placeholder:text-gray-400 rounded-xl shadow-xl" />
                </div>
                <Button type="submit" className="h-12 px-6 bg-amber-500 hover:bg-amber-600 rounded-xl shadow-xl font-bold text-sm">
                  Search
                </Button>
              </form>
              {/* Quick links */}
              <div className="mt-4 flex flex-wrap gap-2">
                {["Aadhar", "PAN Card", "Passport", "AC Repair", "GST"].map(t => (
                  <Link key={t} to="/services" className="text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5 transition-colors font-medium">
                    {t}
                  </Link>
                ))}
              </div>
            </div>

            {/* Right — Stats cards */}
            <div className="hidden lg:grid grid-cols-2 gap-3">
              {stats.map((s, i) => (
                <div key={i} className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-5 hover:bg-white/25 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                  <s.icon size={22} className="text-amber-200 mb-2" />
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-white/60 mt-0.5 font-medium">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Wave bottom */}
        <svg viewBox="0 0 1440 50" fill="none" className="w-full block"><path d="M0 50V25C360 0 720 0 1080 25C1260 37 1440 50 1440 50H0Z" fill="#f8fafc"/></svg>
      </section>

      {/* ═══════════ QUICK ACCESS BAR ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-10">
        <div className="bg-white rounded-xl shadow-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-orange-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Access</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {quickLinks.map((s, i) => (
              <Link key={i} to={s.to} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${s.color}12` }}>
                  <s.icon size={20} style={{ color: s.color }} />
                </div>
                <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">{s.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ G2C — Government to Citizen ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-6 rounded-full bg-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Government Services (G2C)</h2>
          <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full font-semibold border border-blue-100">
            Government to Citizen
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-6 ml-4">Apply for government documents, certificates, and registrations</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {g2cServices.map(s => (
            <div key={s.id}
              className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${activeG2C === s.id ? "border-blue-300 bg-blue-50 shadow-md" : "border-gray-100 bg-white hover:border-gray-200"}`}
              onClick={() => setActiveG2C(activeG2C === s.id ? null : s.id)}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon size={26} style={{ color: s.color }} />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{s.name}</span>
            </div>
          ))}
        </div>

        {/* Sub-services panel */}
        {activeG2C && g2cSubServices[activeG2C] && (
          <div className="mt-4 p-4 bg-blue-50/50 border border-blue-100 rounded-xl animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">
                {g2cServices.find(s => s.id === activeG2C)?.name} — Sub Services
              </h3>
              <Link to={`/services?category=government`} className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {g2cSubServices[activeG2C].map((sub, i) => (
                <Link key={i} to={`/services?category=government`}
                  className="flex items-center gap-2.5 p-3 bg-white rounded-lg border border-blue-100 hover:border-blue-300 hover:shadow-sm transition-all">
                  <FileText size={14} className="text-blue-500 shrink-0" />
                  <span className="text-sm font-medium text-gray-700">{sub}</span>
                  <ChevronRight size={14} className="text-gray-300 ml-auto" />
                </Link>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs font-semibold">
                <Link to={`/services?category=government`}>Apply Now <ArrowRight size={12} className="ml-1" /></Link>
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><Separator /></div>

      {/* ═══════════ B2C — Business to Citizen ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-6 rounded-full bg-orange-500" />
          <h2 className="text-xl font-bold text-gray-900">Service Categories (B2C)</h2>
          <span className="text-xs text-orange-600 bg-orange-50 px-2.5 py-0.5 rounded-full font-semibold border border-orange-100">
            Business to Citizen
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-6 ml-4">Book home services, housekeeping, manpower, and e-commerce assistance</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {b2cServices.map(s => (
            <div key={s.key}
              className={`flex flex-col items-center gap-2.5 p-5 rounded-xl border cursor-pointer transition-all hover:shadow-md ${activeB2C === s.key ? "border-orange-300 bg-orange-50 shadow-md" : "border-gray-100 bg-white hover:border-gray-200"}`}
              onClick={() => setActiveB2C(activeB2C === s.key ? null : s.key)}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: s.bg }}>
                <s.icon size={26} style={{ color: s.color }} />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center">{s.name}</span>
              <span className="text-[10px] text-gray-400">{s.count} services</span>
            </div>
          ))}
        </div>

        {/* Sub-services panel */}
        {activeB2C && b2cSubServices[activeB2C] && (
          <div className="mt-4 p-4 bg-orange-50/50 border border-orange-100 rounded-xl animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800">
                {b2cServices.find(s => s.key === activeB2C)?.name} — Available Services
              </h3>
              <Link to={`/services?category=${activeB2C}`} className="text-xs text-orange-600 font-semibold hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {b2cSubServices[activeB2C].map((sub, i) => (
                <Link key={i} to={`/services?category=${activeB2C}`}
                  className="flex items-center gap-2.5 p-3 bg-white rounded-lg border border-orange-100 hover:border-orange-300 hover:shadow-sm transition-all">
                  <HomeIcon size={14} className="text-orange-500 shrink-0" />
                  <span className="text-sm font-medium text-gray-700">{sub}</span>
                  <ChevronRight size={14} className="text-gray-300 ml-auto" />
                </Link>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm" className="bg-orange-500 hover:bg-orange-600 text-xs font-semibold">
                <Link to={`/services?category=${activeB2C}`}>Book Now <ArrowRight size={12} className="ml-1" /></Link>
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><Separator /></div>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="bg-gradient-to-b from-[#eef2ff] to-[#f8fafc] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900">How It Works</h2>
            <p className="text-sm text-gray-500 mt-1">Simple 4-step process for any service</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { num: "1", title: "Select Service", desc: "Choose from G2C or B2C categories", icon: Search, color: "from-blue-500 to-indigo-600" },
              { num: "2", title: "Fill Details", desc: "Submit info & upload documents", icon: FileText, color: "from-emerald-400 to-teal-600" },
              { num: "3", title: "Make Payment", desc: "Pay via UPI, card, or cash", icon: IndianRupee, color: "from-amber-400 to-orange-500" },
              { num: "4", title: "Track Status", desc: "Monitor progress from dashboard", icon: BadgeCheck, color: "from-violet-500 to-purple-600" },
            ].map((step, i) => (
              <div key={i} className="relative text-center p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all">
                <div className={`w-11 h-11 rounded-xl mx-auto mb-3 flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br ${step.color} shadow-md`}>
                  {step.num}
                </div>
                <h3 className="font-bold text-sm text-gray-900">{step.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{step.desc}</p>
                {i < 3 && <div className="hidden md:block absolute top-1/2 -right-2 -translate-y-1/2 z-10"><ChevronRight size={16} className="text-indigo-300" /></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ WHY CHOOSE US ═══════════ */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Why Choose Mahabharat Consultancy?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: ShieldCheck, title: "Verified & Trusted", desc: "All professionals are background verified and certified", gradient: "from-blue-500 to-indigo-600" },
              { icon: Clock, title: "Fast Processing", desc: "Government apps in 2-5 days. Home services same-day", gradient: "from-emerald-400 to-teal-600" },
              { icon: IndianRupee, title: "Transparent Pricing", desc: "No hidden charges. Price shown is what you pay", gradient: "from-amber-400 to-orange-500" },
              { icon: Award, title: "Quality Guarantee", desc: "30-day warranty on home services. Money-back guarantee", gradient: "from-violet-500 to-purple-600" },
            ].map((f, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${f.gradient} shadow-md`}>
                  <f.icon size={20} className="text-white" />
                </div>
                <h3 className="font-bold text-sm text-gray-900">{f.title}</h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ TESTIMONIALS ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">What Citizens Say</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "Priya Mehta", role: "Business Owner", text: "Got my GST registration done in 3 days. Excellent service and very professional team.", location: "Mumbai" },
            { name: "Rahul Sharma", role: "Homeowner", text: "The deep cleaning service was thorough. My apartment looks brand new! Will definitely book again.", location: "Pune" },
            { name: "Anita Kulkarni", role: "Student", text: "Applied for my passport through them. Very smooth process, they handled everything perfectly.", location: "Nashik" },
          ].map((t, i) => (
            <Card key={i} className="border-gray-100 hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-4">
                <div className="flex gap-0.5 mb-2">{[1,2,3,4,5].map(j => <Star key={j} size={13} className="fill-amber-400 text-amber-400" />)}</div>
                <p className="text-sm text-gray-600 leading-relaxed">"{t.text}"</p>
                <Separator className="my-3" />
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{t.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1"><MapPin size={10} />{t.location} · {t.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="bg-gradient-to-br from-[#4f8ef7] via-[#6c63ff] to-[#38bdf8] rounded-3xl p-8 md:p-12 shadow-xl shadow-blue-500/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white">Start Using Our Services Today</h2>
              <p className="text-white/70 text-sm mt-2 max-w-md">Join thousands of citizens who trust us for government and home services.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild className="bg-white text-indigo-700 hover:bg-indigo-50 shadow-lg font-bold">
                  <Link to="/services?category=government">Apply for Government Service</Link>
                </Button>
                <Button asChild variant="outline" className="text-white border-white/30 hover:bg-white/15 hover:text-white font-semibold">
                  <Link to="/services?category=home">Book Home Service</Link>
                </Button>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-lg">
                <p className="text-white font-semibold text-sm mb-2 flex items-center gap-2"><Phone size={14} /> Helpdesk</p>
                <p className="text-2xl font-bold text-amber-200">+91 98765 43210</p>
                <p className="text-xs text-white/50 mt-1">Mon-Sat, 9 AM - 8 PM</p>
                <Button asChild size="sm" className="mt-4 w-full bg-white text-indigo-700 hover:bg-indigo-50 font-bold">
                  <Link to="/login">Contact Us</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
