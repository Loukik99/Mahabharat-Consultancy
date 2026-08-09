import { Wrench } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { site } from "@/config/site";
import { Seo } from "@/components/Seo";

/** Full-screen "under maintenance" page, shown when VITE_MAINTENANCE=true. */
export default function Maintenance() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center surface-navy">
      <Seo
        title={`Maintenance | ${site.name}`}
        description={`${site.name} is currently undergoing scheduled maintenance.`}
        path="/"
        noindex
      />
      <img
        src={logoImg}
        alt={site.name}
        className="brand-logo mb-6 h-16 w-auto sm:h-20"
        width={80}
        height={98}
        decoding="async"
      />
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-white/5 text-gold mb-5">
        <Wrench size={26} />
      </span>
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">We'll be back shortly</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
        {site.name} is currently undergoing scheduled maintenance and improvements.
        Please check back in a little while, thank you for your patience.
      </p>
      <div className="mt-6 text-sm text-white/60">
        Need help now? <a href={`tel:${site.phone.replace(/\s+/g, "")}`} className="text-gold hover:underline">{site.phone}</a>
      </div>
    </div>
  );
}
