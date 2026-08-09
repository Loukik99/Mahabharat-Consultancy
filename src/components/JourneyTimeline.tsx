import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FileText, FileUp, Cog, Download, type LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";

gsap.registerPlugin(ScrollTrigger);

interface JourneyStep {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const JOURNEY_STEPS: JourneyStep[] = [
  { icon: FileText, title: "Submit Request", desc: "Pick a service and tell us what you need." },
  { icon: FileUp, title: "Upload Documents", desc: "Securely share the required documents online." },
  { icon: Cog, title: "We Process It", desc: "Our team handles it on the official portals." },
  { icon: Download, title: "Pay & Download", desc: "Pay, and download once payment is approved." },
];

/**
 * Compact "How it works" timeline: one straight vertical line runs down
 * the left edge connecting four step cards stacked on a single side, in
 * place of the old long curved, alternating-side route. The line's fill
 * is scrubbed to scroll position (measured once from the real badge
 * positions, so it always starts/ends exactly at the first/last badge),
 * and each card does a single understated fade + slide-up as it enters
 * view, tracked as a high-water mark so scrolling back up never
 * un-reveals a step.
 */
export function JourneyTimeline() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const badgeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const thresholdsRef = useRef<number[]>(JOURNEY_STEPS.map((_, i) => i / (JOURNEY_STEPS.length - 1)));
  const maxProgressRef = useRef(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    const line = lineRef.current;
    if (!wrap || !track || !line) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let scrollTrigger: ScrollTrigger | null = null;
    let resizeFrame = 0;

    const applyProgress = (progress: number) => {
      gsap.set(line, { scaleY: progress });
      thresholdsRef.current.forEach((threshold, i) => {
        const active = progress >= threshold - 0.001;
        badgeRefs.current[i]?.classList.toggle("is-active", active);
        cardRefs.current[i]?.classList.toggle("is-active", active);
      });
    };

    const revealAll = () => {
      maxProgressRef.current = 1;
      applyProgress(1);
    };

    // Reduced motion / no-JS-friendly: show every step immediately.
    if (reduceMotion) {
      const centers = badgeRefs.current.map((el) => {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        return r.top + r.height / 2 - wrapRect.top;
      });
      const top = centers[0] ?? 0;
      const bottom = centers[centers.length - 1] ?? 0;
      track.style.top = `${top}px`;
      track.style.height = `${Math.max(0, bottom - top)}px`;
      line.style.top = `${top}px`;
      line.style.height = `${Math.max(0, bottom - top)}px`;
      revealAll();
      return;
    }

    const updateGeometry = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const centers = badgeRefs.current.map((el) => {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 - wrapRect.top;
      });

      const top = centers[0] ?? 0;
      const bottom = centers[centers.length - 1] ?? 0;
      track.style.top = `${top}px`;
      track.style.height = `${Math.max(0, bottom - top)}px`;
      line.style.top = `${top}px`;
      line.style.height = `${Math.max(0, bottom - top)}px`;

      const span = bottom - top || 1;
      thresholdsRef.current = centers.map((c) => (c - top) / span);

      applyProgress(maxProgressRef.current);
      scrollTrigger?.refresh();
    };

    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(updateGeometry);
    };

    updateGeometry();

    // First step should never wait for scroll — show it immediately.
    maxProgressRef.current = Math.max(maxProgressRef.current, 0.001);
    applyProgress(maxProgressRef.current);

    scrollTrigger = ScrollTrigger.create({
      trigger: wrap,
      start: "top 90%",
      end: "bottom 50%",
      onUpdate: (self) => {
        if (self.progress > maxProgressRef.current) {
          maxProgressRef.current = self.progress;
          applyProgress(maxProgressRef.current);
        }
      },
      onEnter: (self) => {
        if (self.progress > maxProgressRef.current) {
          maxProgressRef.current = self.progress;
          applyProgress(maxProgressRef.current);
        }
      },
    });

    // Safety net: never leave journey cards stuck at opacity 0.
    const fallback = window.setTimeout(revealAll, 1200);

    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(wrap);

    return () => {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      window.clearTimeout(fallback);
      scrollTrigger?.kill();
    };
  }, []);

  return (
    <section className="border-y border-mist bg-white py-10 sm:py-12 lg:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="How it works"
          sub="Four simple steps from request to delivery."
          align="center"
        />

        <div ref={wrapRef} className="relative mx-auto mt-8 max-w-md sm:mt-9 sm:max-w-lg lg:max-w-xl">
          <div ref={trackRef} className="absolute left-4 w-px bg-mist sm:left-5" aria-hidden="true" />
          <div
            ref={lineRef}
            className="absolute left-4 w-px origin-top bg-navy sm:left-5"
            style={{ transform: "scaleY(0)" }}
            aria-hidden="true"
          />

          <ol className="relative flex flex-col gap-5 sm:gap-6">
            {JOURNEY_STEPS.map((step, i) => (
              <li key={step.title} className="relative flex items-start gap-4 sm:gap-5">
                <span
                  ref={(el) => {
                    badgeRefs.current[i] = el;
                  }}
                  className="journey-badge relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mist bg-white font-display text-[12px] font-bold text-fog shadow-subtle sm:h-10 sm:w-10 sm:text-[13px]"
                >
                  {i + 1}
                </span>

                <div
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className="journey-card min-w-0 flex-1 rounded-2xl border border-mist bg-white p-4 sm:p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/[0.07] text-navy">
                      <step.icon size={17} />
                    </span>
                    <h3 className="font-display text-[15px] font-bold text-ink sm:text-[1.05rem]">{step.title}</h3>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-smoke sm:text-[13.5px]">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
