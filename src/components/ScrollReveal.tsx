import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type ScrollRevealDirection = "left" | "right";

export interface ScrollRevealProps {
  children: ReactNode;
  /** Explicit direction. Ignored when `index` is provided (index drives L/R). */
  direction?: ScrollRevealDirection;
  /**
   * When set, direction alternates LEFT → RIGHT → LEFT → RIGHT
   * based on index, and a subtle stagger delay is applied.
   */
  index?: number;
  /** Extra delay in ms (added on top of index stagger). */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  /** Polymorphic root element. Defaults to `div`. */
  as?: ElementType;
}

const STAGGER_MS = 70;
const MAX_STAGGER_INDEX = 8;
const DURATION_MS = 700;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isInOrNearViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.top < vh * 0.92 && rect.bottom > vh * 0.08;
}

/** False for `display:none` / zero-box nodes (e.g. mobile-only lists on desktop). */
function isLayoutVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

/** Shared near-viewport poll — one timer for all pending reveals (no N intervals). */
type PendingReveal = { el: Element; reveal: () => void };
const pendingReveals = new Set<PendingReveal>();
let pendingTimer = 0;

function watchNearViewport(el: Element, reveal: () => void): () => void {
  const item: PendingReveal = { el, reveal };
  pendingReveals.add(item);
  if (!pendingTimer) {
    pendingTimer = window.setInterval(() => {
      for (const entry of [...pendingReveals]) {
        if (isInOrNearViewport(entry.el)) {
          entry.reveal();
          pendingReveals.delete(entry);
        }
      }
      if (pendingReveals.size === 0) {
        window.clearInterval(pendingTimer);
        pendingTimer = 0;
      }
    }, 400);
  }
  return () => {
    pendingReveals.delete(item);
    if (pendingReveals.size === 0 && pendingTimer) {
      window.clearInterval(pendingTimer);
      pendingTimer = 0;
    }
  };
}

/**
 * One-shot scroll reveal: fades in from the left or right the first time
 * the element enters the viewport while scrolling down. Once revealed it
 * stays visible forever — never reverses, never replays.
 *
 * Content is visible by default until JS arms the hidden start state, so
 * a failed observer can never permanently hide anything. Reduced motion
 * skips animation and shows content immediately.
 */
export function ScrollReveal({
  children,
  direction: directionProp = "left",
  index,
  delay = 0,
  className,
  style,
  as: Tag = "div",
}: ScrollRevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const doneRef = useRef(false);
  // Visible until armed; hidden only while armed && !shown; shown forever after.
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  const direction: ScrollRevealDirection =
    typeof index === "number" ? (index % 2 === 0 ? "left" : "right") : directionProp;

  const stagger =
    typeof index === "number" ? Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS : 0;
  const totalDelay = delay + stagger;

  useEffect(() => {
    const el = ref.current;
    if (!el || doneRef.current) return;

    if (prefersReducedMotion()) {
      doneRef.current = true;
      setShown(true);
      return;
    }

    // Responsive duplicates (e.g. `lg:hidden` on desktop) must never be
    // armed at opacity 0 — IntersectionObserver will not fire for them.
    if (!isLayoutVisible(el)) {
      doneRef.current = true;
      setShown(true);
      return;
    }

    let observer: IntersectionObserver | null = null;
    let raf1 = 0;
    let raf2 = 0;
    let stopWatch: (() => void) | null = null;

    const reveal = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setShown(true);
      observer?.disconnect();
      observer = null;
      stopWatch?.();
      stopWatch = null;
    };

    // Arm the hidden state after paint so the transition has a real "from"
    // frame. Content stays visible until then (no-JS / slow-JS safe).
    raf1 = requestAnimationFrame(() => {
      if (doneRef.current) return;

      // Re-check after paint — layout may not be ready on the first tick.
      if (!isLayoutVisible(el)) {
        reveal();
        return;
      }

      setArmed(true);
      raf2 = requestAnimationFrame(() => {
        if (doneRef.current) return;

        observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              reveal();
            }
          },
          {
            // Any visible pixel is enough — never require a large ratio
            // (tall cards / short mobile viewports often never hit 0.5).
            threshold: 0,
            // Start a touch early so the motion feels intentional, not late.
            rootMargin: "0px 0px -8% 0px",
          }
        );
        observer.observe(el);

        if (isInOrNearViewport(el)) {
          reveal();
          return;
        }

        // Mobile / IO quirks: shared near-viewport poll (not a blanket timeout).
        stopWatch = watchNearViewport(el, reveal);
      });
    });

    return () => {
      observer?.disconnect();
      stopWatch?.();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const pending = armed && !shown;

  return (
    <Tag
      ref={ref as never}
      className={cn(
        "scroll-reveal",
        pending && "scroll-reveal--pending",
        shown && "scroll-reveal--shown",
        direction === "left" ? "scroll-reveal--from-left" : "scroll-reveal--from-right",
        className
      )}
      style={
        {
          ...style,
          "--scroll-reveal-delay": `${totalDelay}ms`,
          "--scroll-reveal-duration": `${DURATION_MS}ms`,
        } as CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
