import { Wrench } from "lucide-react";
import logoImg from "@/assets/logo.jpeg";
import { site } from "@/config/site";

/** Full-screen "under maintenance" page, shown when VITE_MAINTENANCE=true. */
export default function Maintenance() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center surface-navy">
      <img src={logoImg} alt={site.name} className="h-16 w-auto rounded bg-white/95 p-1 mb-6" />
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
