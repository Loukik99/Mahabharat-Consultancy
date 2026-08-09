import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Clock, ArrowUpRight } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { site, waLink } from "@/config/site";

const quickLinks = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/jobs", label: "Government Jobs" },
  { to: "/digital-solutions", label: "Digital Solutions" },
  { to: "/login", label: "Customer Login" },
  { to: "/signup", label: "Create Account" },
];

function WhatsAppGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.515 5.26l-.999 3.648 3.973-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

/**
 * Floating premium footer: one large rounded glass panel (navy)
 * with brand, quick links and address columns, plus a quiet bottom bar.
 *
 * Note: avoid non-standard opacity steps like bg-navy-deep/92 — Tailwind
 * only emits known scale values (…/90, /95), so invalid steps leave the
 * panel transparent and white text invisible on the white page.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto bg-white px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-14 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Main floating container — solid navy so content stays visible */}
        <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-navy-deep shadow-elevated sm:rounded-[32px]">
          {/* Soft glass highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-emerald/20"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(0 0% 100% / 0.04) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.04) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(700px 420px at 80% 0%, black, transparent 75%)",
            }}
          />

          <div className="relative grid grid-cols-1 gap-10 p-8 sm:gap-12 sm:p-10 md:grid-cols-2 lg:grid-cols-3 lg:gap-14 lg:p-12">
            {/* Column 1: brand */}
            <div className="min-w-0">
              <Link to="/" className="inline-flex items-center gap-3.5">
                <img
                  src={logoImg}
                  alt="Mahabharat Consultancy"
                  className="brand-logo h-14 w-auto sm:h-16"
                  width={64}
                  height={78}
                  decoding="async"
                />
                <div className="leading-tight">
                  <p className="font-display text-[15px] font-bold text-white">{site.name}</p>
                  <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.09em] text-gold">
                    {site.tagline}
                  </p>
                </div>
              </Link>
              <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-white/70">
                Your trusted service center for government documents, tax and GST, exam and job forms,
                printing, and bill payments in Belagavi.
              </p>
            </div>

            {/* Column 2: quick links */}
            <div className="min-w-0">
              <h4 className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">
                Quick Links
              </h4>
              <nav className="mt-5 flex flex-col gap-3" aria-label="Footer quick links">
                {quickLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="group inline-flex items-center gap-1.5 text-[14px] text-white/75 transition-colors hover:text-white"
                  >
                    {l.label}
                    <ArrowUpRight
                      size={12}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                ))}
              </nav>
            </div>

            {/* Column 3: address / contact */}
            <div className="min-w-0 md:col-span-2 lg:col-span-1">
              <h4 className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">
                Address
              </h4>
              <div className="mt-5 space-y-3.5">
                <ContactRow icon={MapPin}>
                  <a
                    href={site.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white"
                  >
                    {site.address}
                  </a>
                </ContactRow>
                <ContactRow icon={Phone}>
                  <a href={`tel:${site.phone.replace(/\s+/g, "")}`} className="hover:text-white">
                    {site.phone}
                  </a>
                </ContactRow>
                <ContactRow icon={Mail}>
                  <a href={`mailto:${site.email}`} className="hover:text-white">
                    {site.email}
                  </a>
                </ContactRow>
                <ContactRow icon={Clock}>{site.workingHours}</ContactRow>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <SocialIcon href={waLink()} label="Chat on WhatsApp" external>
                  <WhatsAppGlyph size={15} />
                </SocialIcon>
                <SocialIcon href={`tel:${site.phone.replace(/\s+/g, "")}`} label="Call us">
                  <Phone size={14} />
                </SocialIcon>
                <SocialIcon href={`mailto:${site.email}`} label="Email us">
                  <Mail size={14} />
                </SocialIcon>
                <SocialIcon href={site.googleMapsUrl} label="Find us on Google Maps" external>
                  <MapPin size={14} />
                </SocialIcon>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-5 flex flex-col gap-3 border-t border-navy/10 pt-5 text-[12px] leading-relaxed text-smoke sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <p className="shrink-0">
            &copy; {year} {site.name}. All rights reserved.
          </p>
          <p className="max-w-xl sm:text-right">
            A private assistance and service center, not a government agency. We do not represent
            UIDAI, the Income Tax Dept., GST, or any official portal, we only guide you to them.
          </p>
        </div>
      </div>
    </footer>
  );
}

function ContactRow({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-white/75">
      <Icon size={15} className="mt-0.5 shrink-0 text-gold" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SocialIcon({
  href,
  label,
  external,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/50 hover:text-gold"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
