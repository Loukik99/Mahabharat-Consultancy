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
  const cats = serviceCategories.slice(0, 6);

  return (
    <footer className="surface-navy mt-auto">
      <div className="gold-rule" />

      {/* Disclaimer */}
      <div className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-start gap-2.5 px-4 py-3 text-[12px] leading-relaxed text-white/55 sm:px-6 lg:px-8">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-gold/70" />
          <p>
            <strong className="text-white/80">{site.name}</strong> is a private assistance / service center.
            We are <strong className="text-white/80">not</strong> a government agency and do not represent UIDAI,
            the Income Tax Dept., GST, or any official portal. We direct you only to the official government websites.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3">
              <img src={logoImg} alt="MB" className="h-11 w-auto rounded bg-white/95 p-0.5" />
              <div className="leading-tight">
                <p className="font-display text-base font-semibold text-white">{site.name}</p>
                <p className="eyebrow text-[9px] text-gold">{site.tagline}</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-white/55">
              Your trusted online services center for government documents, tax &amp; GST, exam and job
              forms, printing, and bill payments, serving Belagavi and beyond.
            </p>
          </div>

          {/* Categories */}
          <FooterCol title="Service Categories">
            {cats.map((c) => (
              <FooterLink key={c.id} to={`/services?cat=${c.id}`}>{c.name}</FooterLink>
            ))}
          </FooterCol>

          {/* Quick links */}
          <FooterCol title="Quick Links">
            {quickLinks.map((l) => (
              <FooterLink key={l.label} to={l.to}>{l.label}</FooterLink>
            ))}
          </FooterCol>

          {/* Contact */}
          <FooterCol title="Visit / Contact">
            <ContactItem icon={Phone} href={`tel:${site.phone.replace(/\s/g, "")}`}>{site.phone}</ContactItem>
            <ContactItem
              icon={() => (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.515 5.26l-.999 3.648 3.973-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
              )}
              href={waLink()} external
            >
              WhatsApp Us
            </ContactItem>
            <ContactItem icon={Mail} href={`mailto:${site.email}`}>{site.email}</ContactItem>
            <ContactItem icon={MapPin}>{site.address}</ContactItem>
            <ContactItem icon={Clock}>{site.workingHours}</ContactItem>
          </FooterCol>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-6 text-xs text-white/40 md:flex-row">
          <p>&copy; {new Date().getFullYear()} {site.name}. All rights reserved.</p>
          <p>Owner: {site.ownerName}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="eyebrow mb-4 text-gold">{title}</h4>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="group flex items-center gap-1 text-sm text-white/60 transition-colors hover:text-white">
      {children}
      <ArrowUpRight size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function ContactItem({ icon: Icon, href, external, children }: { icon: React.ElementType; href?: string; external?: boolean; children: React.ReactNode }) {
  const inner = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 bg-white/5 text-gold">
        <Icon size={14} />
      </span>
      <span className="pt-1.5">{children}</span>
    </>
  );
  const cls = "flex items-start gap-2.5 text-sm text-white/60 transition-colors hover:text-white";
  if (!href) return <div className={cls}>{inner}</div>;
  return (
    <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {inner}
    </a>
  );
}
