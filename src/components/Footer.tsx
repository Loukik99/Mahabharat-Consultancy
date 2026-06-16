import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Clock, ArrowUpRight, ShieldAlert } from "lucide-react";
import logoImg from "@/assets/logo.jpeg";
import { site, waLink } from "@/config/site";
import { serviceCategories } from "@/data/catalog";

const quickLinks = [
  { to: "/services", label: "All Services" },
  { to: "/jobs", label: "Government Jobs" },
  { to: "/login", label: "Customer Login" },
  { to: "/signup", label: "Create Account" },
];

export function Footer() {
  // First five categories as a "popular categories" column.
  const cats = serviceCategories.slice(0, 6);

  return (
    <footer className="bg-gradient-to-b from-[#f0f4ff] to-[#e8eeff] text-gray-500 mt-auto border-t border-indigo-100">
      <div className="h-1 bg-gradient-to-r from-[#4f8ef7] via-[#6c63ff] to-[#38bdf8]" />

      {/* Legal / assistance-center disclaimer */}
      <div className="bg-amber-50 border-b border-amber-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start gap-2.5 text-[12px] leading-relaxed text-amber-800">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <p>
            <strong>{site.name}</strong> is a private assistance / service center. We are <strong>not</strong> a
            government agency and do not represent UIDAI, Income Tax Dept., GST, or any official portal. For
            government services we assist you and direct you only to the official government websites.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <img src={logoImg} alt="MB" className="h-10 w-auto" />
              <div>
                <p className="text-gray-900 font-bold text-sm">{site.name}</p>
                <p className="text-[9px] text-indigo-500 tracking-[0.15em] uppercase font-semibold">{site.tagline}</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed">
              Your trusted online services center for government documents, tax & GST, exam and job forms,
              printing, and bill payments — serving Belagavi and beyond.
            </p>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-gray-800 font-semibold text-xs uppercase tracking-wider mb-4">Service Categories</h4>
            <div className="space-y-2">
              {cats.map((c) => (
                <Link key={c.id} to={`/services?cat=${c.id}`} className="flex items-center gap-1 text-sm hover:text-indigo-600 transition-colors group">
                  {c.name}
                  <ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="text-gray-800 font-semibold text-xs uppercase tracking-wider mb-4">Quick Links</h4>
            <div className="space-y-2">
              {quickLinks.map((l) => (
                <Link key={l.label} to={l.to} className="flex items-center gap-1 text-sm hover:text-indigo-600 transition-colors group">
                  {l.label}
                  <ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* Contact / visit */}
          <div>
            <h4 className="text-gray-800 font-semibold text-xs uppercase tracking-wider mb-4">Visit / Contact</h4>
            <div className="space-y-3 text-sm">
              <a href={`tel:${site.phone.replace(/\s/g, "")}`} className="flex items-center gap-2.5 hover:text-indigo-600 transition-colors">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0"><Phone size={14} className="text-indigo-500" /></span>
                {site.phone}
              </a>
              <a href={waLink()} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 hover:text-green-600 transition-colors">
                <span className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" className="text-green-600"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.515 5.26l-.999 3.648 3.973-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                </span>
                WhatsApp Us
              </a>
              <a href={`mailto:${site.email}`} className="flex items-center gap-2.5 hover:text-indigo-600 transition-colors">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0"><Mail size={14} className="text-indigo-500" /></span>
                {site.email}
              </a>
              <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0"><MapPin size={14} className="text-indigo-500" /></span>
                <span>{site.address}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0"><Clock size={14} className="text-indigo-500" /></span>
                {site.workingHours}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-indigo-100 mt-10 pt-5 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} {site.name}. All rights reserved.</p>
          <p className="text-xs text-gray-400">Owner: {site.ownerName}</p>
        </div>
      </div>
    </footer>
  );
}
