import { MapPin, Phone, ArrowUpRight } from "lucide-react";
import { site, waLink } from "@/config/site";
import { ScrollReveal } from "@/components/ScrollReveal";

function WhatsAppGlyph({ size = 19 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.515 5.26l-.999 3.648 3.973-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

/**
 * Home CTA: one unified premium panel with a single background, border and
 * shadow, and no divider splitting it. Content is separated by spacing
 * and alignment alone. Left (~45%) is a way to reach us right now
 * (WhatsApp / call); right (~55%) is a place to find us (address +
 * map). On mobile the panel stacks with the contact column first and
 * the map second, matching the visual order on desktop.
 */
export function HomeCta() {
  return (
    <section className="bg-snow">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="overflow-hidden rounded-[28px] border border-mist bg-white shadow-card">
          <div className="grid items-start gap-10 p-8 sm:gap-12 sm:p-10 lg:grid-cols-[45%_55%] lg:gap-16 lg:p-12">
            {/* Left column (~45%): reach us now */}
            <ScrollReveal direction="left">
              <p className="eyebrow text-navy">Get in touch</p>
              <h3 className="font-display mt-3 text-[1.55rem] font-extrabold leading-tight text-navy-deep sm:text-[1.8rem]">
                Need help with your application?
              </h3>
              <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-smoke">
                Message us on WhatsApp and our team will walk you through the paperwork, step by step,
                no visit required to get started.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href={waLink(`Hello ${site.name}, I would like to know about your services.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 rounded-full bg-[#25D366] px-7 py-3.5 text-[14.5px] font-bold text-white shadow-subtle transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#1fbd5a]"
                >
                  <WhatsAppGlyph size={19} /> Chat on WhatsApp
                </a>
                <a
                  href={`tel:${site.phone.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-2 rounded-full border border-mist bg-white px-6 py-3.5 text-[14.5px] font-semibold text-ink transition-colors duration-300 hover:border-navy/25 hover:bg-ink/[0.02]"
                >
                  <Phone size={16} /> Call Now
                </a>
              </div>
            </ScrollReveal>

            {/* Right column (~55%): find us */}
            <ScrollReveal direction="right" delay={80}>
              <p className="eyebrow text-gold">Visit us</p>
              <h3 className="font-display mt-3 text-[1.55rem] font-extrabold leading-tight text-navy-deep sm:text-[1.8rem]">
                Visit our service center
              </h3>

              <div className="mt-6 flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/[0.06] text-navy">
                  <MapPin size={16} />
                </span>
                <div>
                  <p className="text-[14.5px] font-bold text-ink">{site.name}</p>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-smoke">Belagavi, Karnataka</p>
                </div>
              </div>

              <div className="mt-6 px-6 sm:px-7 lg:px-8">
                <div className="overflow-hidden rounded-2xl border border-mist">
                  <iframe
                    src={site.mapEmbedUrl}
                    title={`${site.name} on Google Maps`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="h-56 w-full sm:h-64"
                    style={{ border: 0, display: "block" }}
                  />
                </div>
              </div>

              <a
                href={site.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-mist bg-white px-5 py-2.5 text-[13.5px] font-semibold text-ink transition-colors duration-300 hover:border-navy/25 hover:bg-ink/[0.02]"
              >
                View on Google Maps <ArrowUpRight size={14} />
              </a>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
