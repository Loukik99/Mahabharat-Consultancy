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
  /** IntersectionObserver threshold (0–1). Default 0 = any pixel visible. */
  threshold?: number | number[];
}

const STAGGER_MS = 70;
const MAX_STAGGER_INDEX = 8;
const DURATION_MS = 700;
/** Absolute safety: never leave content invisible if IO stalls. */
const FALLBACK_MS = 1000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isNearViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  // Generous vertical slack so tall mobile blocks still count as "in view".
  return rect.top < vh * 1.05 && rect.bottom > -vh * 0.05;
}

/**
 * One-shot scroll reveal: fades in from the left or right the first time
 * the element nears the viewport. Content stays visible if JS fails
 * (hidden state is only applied after mount). Respects reduced motion.
 *
 * Animation enhances entrance — it must never leave content stuck hidden.
 */
export function ScrollReveal({
  children,
  direction: directionProp = "left",
  index,
  delay = 0,
  className,
  style,
  as: Tag = "div",
  threshold = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Start visible so content is never stuck hidden before hydration / without JS.
  const [phase, setPhase] = useState<"idle" | "ready" | "visible">("idle");

  const direction: ScrollRevealDirection =
    typeof index === "number" ? (index % 2 === 0 ? "left" : "right") : directionProp;

  const stagger =
    typeof index === "number" ? Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS : 0;
  const totalDelay = delay + stagger;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      setPhase("visible");
      return;
    }

    // Arm the hidden start state, then wait two frames so the browser paints
    // opacity/transform before we observe — otherwise the transition can skip.
    setPhase("ready");

    let revealed = false;
    let raf1 = 0;
    let raf2 = 0;
    let observer: IntersectionObserver | null = null;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      setPhase("visible");
      observer?.disconnect();
    };

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        // Soft criteria: any intersection pixel counts. Positive rootMargin
        // expands the hit box so tall mobile sections trigger reliably.
        observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              reveal();
            }
          },
          {
            threshold: Array.isArray(threshold) ? threshold : [0, 0.01, 0.05, 0.1, 0.2],
            rootMargin: "80px 0px 80px 0px",
          }
        );
        observer.observe(el);

        // Already on screen (above-the-fold / tall cards) — reveal immediately.
        if (isNearViewport(el)) {
          reveal();
        }
      });
    });

    // ALWAYS reveal after FALLBACK_MS — even if IO fired with isIntersecting:false.
    // Animations enhance entrance; they must never permanently hide content.
    const fallback = window.setTimeout(reveal, FALLBACK_MS);

    return () => {
      observer?.disconnect();
      window.clearTimeout(fallback);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [threshold]);

  return (
    <Tag
      ref={ref as never}
      className={cn(
        "scroll-reveal",
        phase === "ready" && "scroll-reveal--ready",
        phase === "visible" && "scroll-reveal--visible",
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
