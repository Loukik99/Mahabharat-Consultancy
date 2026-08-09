import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Layers, ShieldCheck, Clock3, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricItem {
  icon: LucideIcon;
  value: string;
  label: string;
}

const METRICS: MetricItem[] = [
  { icon: LayoutGrid, value: "40+", label: "Services" },
  { icon: Layers, value: "7", label: "Categories" },
  { icon: ShieldCheck, value: "100%", label: "Official Portals" },
  { icon: Clock3, value: "Same-day", label: "Assistance" },
];

/**
 * Premium dashboard-style statistics strip. Four facts inside a single
 * glass-on-white card (soft gradient wash, hairline border, one shared
 * shadow) instead of four loose boxes, so it reads as one component
 * between Services and How it works. Reveals with a gentle staggered
 * entrance the first time it scrolls into view; each cell gets a quiet
 * hover lift and its icon a subtle scale/rotate.
 */
export function TrustMetricsBar() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let delivered = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          delivered = true;
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    // Safety net: reveal even if IntersectionObserver never fires (rare).
    const fallback = window.setTimeout(() => {
      if (!delivered) setInView(true);
    }, 1200);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <section className="bg-snow py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          ref={wrapRef}
          className="relative overflow-hidden rounded-[28px] border border-mist bg-gradient-to-b from-white to-snow/70 shadow-card"
        >
          <div className="grid grid-cols-2 divide-x divide-y divide-mist/60 sm:grid-cols-4 sm:divide-y-0">
            {METRICS.map((m, i) => (
              <div
                key={m.label}
                className={cn(
                  "group flex flex-col items-center gap-3 px-4 py-8 text-center opacity-0 transition-[transform,background-color] duration-300 ease-out hover:-translate-y-1 hover:bg-navy/[0.025] sm:py-10",
                  inView && "opacity-100"
                )}
                style={inView ? { animation: `slide-up 0.6s cubic-bezier(0.22,1,0.36,1) ${i * 90}ms forwards` } : undefined}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy/[0.06] text-navy transition-all duration-300 ease-out group-hover:-rotate-3 group-hover:scale-110 group-hover:bg-gold/[0.16] group-hover:text-gold-foreground">
                  <m.icon size={17} strokeWidth={2} />
                </span>
                <div>
                  <p className="font-display text-[1.55rem] font-extrabold leading-none tracking-tight text-navy-deep sm:text-[1.75rem]">
                    {m.value}
                  </p>
                  <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-smoke/70">{m.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
