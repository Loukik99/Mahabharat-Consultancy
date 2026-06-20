import { Link } from "react-router-dom";
import { ChevronLeft, CheckCircle2, MessageCircle } from "lucide-react";
import { digitalSolutions as ds } from "@/data/digitalSolutions";
import { Button } from "@/components/ui/button";

export default function DigitalSolutions() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/services" className="text-sm font-medium text-navy hover:text-gold mb-6 inline-flex items-center gap-1 transition-colors">
        <ChevronLeft size={15} /> Back to services
      </Link>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="surface-navy px-6 py-8 sm:px-10 flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/95 p-2">
            <img src={ds.icon} alt="Digital Solutions" className="h-full w-full object-contain" />
          </span>
          <div>
            <p className="eyebrow text-gold">Digital Solutions</p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">{ds.title}</h1>
          </div>
        </div>

        <div className="px-6 py-8 sm:px-10">
          <p className="text-[15px] leading-relaxed text-foreground">{ds.description}</p>

          <h2 className="mt-7 mb-3 font-display text-lg font-semibold text-navy">What we build</h2>
          <ul className="space-y-2.5">
            {ds.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2.5 text-sm text-foreground">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-gold" /> {h}
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-lg border-l-2 border-gold bg-secondary/60 p-5">
            <p className="font-display text-base font-semibold text-navy">Want to build a website or app?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Chat with us on WhatsApp and tell us about your project, we'll guide you from idea to launch.
            </p>
            <Button asChild size="lg" className="mt-4 bg-gold font-semibold text-gold-foreground hover:bg-gold/90">
              <a href={ds.whatsappLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={18} className="mr-1.5" /> Chat on WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
