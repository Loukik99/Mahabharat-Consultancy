import { useRef, useEffect, useCallback, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import "./MagicBento.css";

// Adapted from reactbits.dev "Magic Bento" — converted to TS, made data-driven
// (renders our service categories as clickable cards) and rethemed navy/gold.

export interface BentoCard {
  title: string;
  description: string;
  label: string;
  href: string;
}

const DEFAULT_PARTICLE_COUNT = 12;
const DEFAULT_SPOTLIGHT_RADIUS = 320;
const DEFAULT_GLOW_COLOR = "198, 162, 71"; // gold
const MOBILE_BREAKPOINT = 768;

const createParticleElement = (x: number, y: number, color = DEFAULT_GLOW_COLOR): HTMLDivElement => {
  const el = document.createElement("div");
  el.className = "particle";
  el.style.cssText = `position:absolute;width:4px;height:4px;border-radius:50%;background:rgba(${color},1);box-shadow:0 0 6px rgba(${color},0.6);pointer-events:none;z-index:100;left:${x}px;top:${y}px;`;
  return el;
};

const calculateSpotlightValues = (radius: number) => ({
  proximity: radius * 0.5,
  fadeDistance: radius * 0.75,
});

const updateCardGlowProperties = (card: HTMLElement, mouseX: number, mouseY: number, glow: number, radius: number) => {
  const rect = card.getBoundingClientRect();
  const relativeX = ((mouseX - rect.left) / rect.width) * 100;
  const relativeY = ((mouseY - rect.top) / rect.height) * 100;
  card.style.setProperty("--glow-x", `${relativeX}%`);
  card.style.setProperty("--glow-y", `${relativeY}%`);
  card.style.setProperty("--glow-intensity", glow.toString());
  card.style.setProperty("--glow-radius", `${radius}px`);
};

interface CardProps {
  card: BentoCard;
  className: string;
  disableAnimations: boolean;
  particleCount: number;
  glowColor: string;
  enableStars: boolean;
  enableTilt: boolean;
  clickEffect: boolean;
  enableMagnetism: boolean;
}

function ParticleCard({
  card, className, disableAnimations, particleCount, glowColor, enableStars, enableTilt, clickEffect, enableMagnetism,
}: CardProps) {
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const particlesRef = useRef<HTMLElement[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const isHoveredRef = useRef(false);
  const memoizedParticles = useRef<HTMLElement[]>([]);
  const particlesInitialized = useRef(false);
  const magnetismAnimationRef = useRef<gsap.core.Tween | null>(null);

  const initializeParticles = useCallback(() => {
    if (particlesInitialized.current || !cardRef.current) return;
    const { width, height } = cardRef.current.getBoundingClientRect();
    memoizedParticles.current = Array.from({ length: particleCount }, () =>
      createParticleElement(Math.random() * width, Math.random() * height, glowColor)
    );
    particlesInitialized.current = true;
  }, [particleCount, glowColor]);

  const clearAllParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    magnetismAnimationRef.current?.kill();
    particlesRef.current.forEach((particle) => {
      gsap.to(particle, {
        scale: 0, opacity: 0, duration: 0.3, ease: "back.in(1.7)",
        onComplete: () => particle.parentNode?.removeChild(particle),
      });
    });
    particlesRef.current = [];
  }, []);

  const animateParticles = useCallback(() => {
    if (!cardRef.current || !isHoveredRef.current || !enableStars) return;
    if (!particlesInitialized.current) initializeParticles();
    memoizedParticles.current.forEach((particle, index) => {
      const timeoutId = window.setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return;
        const clone = particle.cloneNode(true) as HTMLElement;
        cardRef.current.appendChild(clone);
        particlesRef.current.push(clone);
        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.7)" });
        gsap.to(clone, { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100, rotation: Math.random() * 360, duration: 2 + Math.random() * 2, ease: "none", repeat: -1, yoyo: true });
        gsap.to(clone, { opacity: 0.3, duration: 1.5, ease: "power2.inOut", repeat: -1, yoyo: true });
      }, index * 100);
      timeoutsRef.current.push(timeoutId);
    });
  }, [initializeParticles, enableStars]);

  useEffect(() => {
    if (disableAnimations || !cardRef.current) return;
    const element = cardRef.current;

    const onEnter = () => {
      isHoveredRef.current = true;
      animateParticles();
      if (enableTilt) gsap.to(element, { rotateX: 5, rotateY: 5, duration: 0.3, ease: "power2.out", transformPerspective: 1000 });
    };
    const onLeave = () => {
      isHoveredRef.current = false;
      clearAllParticles();
      if (enableTilt) gsap.to(element, { rotateX: 0, rotateY: 0, duration: 0.3, ease: "power2.out" });
      if (enableMagnetism) gsap.to(element, { x: 0, y: 0, duration: 0.3, ease: "power2.out" });
    };
    const onMove = (e: MouseEvent) => {
      if (!enableTilt && !enableMagnetism) return;
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (enableTilt) {
        gsap.to(element, { rotateX: ((y - cy) / cy) * -10, rotateY: ((x - cx) / cx) * 10, duration: 0.1, ease: "power2.out", transformPerspective: 1000 });
      }
      if (enableMagnetism) {
        magnetismAnimationRef.current = gsap.to(element, { x: (x - cx) * 0.05, y: (y - cy) * 0.05, duration: 0.3, ease: "power2.out" });
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!clickEffect) return;
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const maxDistance = Math.max(
        Math.hypot(x, y), Math.hypot(x - rect.width, y), Math.hypot(x, y - rect.height), Math.hypot(x - rect.width, y - rect.height)
      );
      const ripple = document.createElement("div");
      ripple.style.cssText = `position:absolute;width:${maxDistance * 2}px;height:${maxDistance * 2}px;border-radius:50%;background:radial-gradient(circle, rgba(${glowColor},0.4) 0%, rgba(${glowColor},0.2) 30%, transparent 70%);left:${x - maxDistance}px;top:${y - maxDistance}px;pointer-events:none;z-index:1000;`;
      element.appendChild(ripple);
      gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: "power2.out", onComplete: () => ripple.remove() });
    };

    element.addEventListener("mouseenter", onEnter);
    element.addEventListener("mouseleave", onLeave);
    element.addEventListener("mousemove", onMove);
    element.addEventListener("click", onClick);
    return () => {
      isHoveredRef.current = false;
      element.removeEventListener("mouseenter", onEnter);
      element.removeEventListener("mouseleave", onLeave);
      element.removeEventListener("mousemove", onMove);
      element.removeEventListener("click", onClick);
      clearAllParticles();
    };
  }, [animateParticles, clearAllParticles, disableAnimations, enableTilt, enableMagnetism, clickEffect, glowColor]);

  return (
    <Link
      ref={cardRef}
      to={card.href}
      className={`${className} particle-container`}
      style={{ "--glow-color": glowColor } as CSSProperties}
    >
      <div className="magic-bento-card__header">
        <div className="magic-bento-card__label">{card.label}</div>
      </div>
      <div className="magic-bento-card__content">
        <h2 className="magic-bento-card__title">{card.title}</h2>
        <p className="magic-bento-card__description">{card.description}</p>
      </div>
    </Link>
  );
}

function GlobalSpotlight({
  gridRef, disableAnimations, enabled, spotlightRadius, glowColor,
}: {
  gridRef: React.RefObject<HTMLDivElement>;
  disableAnimations: boolean;
  enabled: boolean;
  spotlightRadius: number;
  glowColor: string;
}) {
  const spotlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disableAnimations || !gridRef.current || !enabled) return;
    const spotlight = document.createElement("div");
    spotlight.className = "global-spotlight";
    spotlight.style.cssText = `position:fixed;width:800px;height:800px;border-radius:50%;pointer-events:none;background:radial-gradient(circle, rgba(${glowColor},0.15) 0%, rgba(${glowColor},0.08) 15%, rgba(${glowColor},0.04) 25%, rgba(${glowColor},0.02) 40%, rgba(${glowColor},0.01) 65%, transparent 70%);z-index:200;opacity:0;transform:translate(-50%,-50%);mix-blend-mode:screen;`;
    document.body.appendChild(spotlight);
    spotlightRef.current = spotlight;

    const onMove = (e: MouseEvent) => {
      if (!spotlightRef.current || !gridRef.current) return;
      const section = gridRef.current.closest(".bento-section");
      const rect = section?.getBoundingClientRect();
      const inside = !!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const cards = gridRef.current.querySelectorAll<HTMLElement>(".magic-bento-card");
      if (!inside) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3, ease: "power2.out" });
        cards.forEach((c) => c.style.setProperty("--glow-intensity", "0"));
        return;
      }
      const { proximity, fadeDistance } = calculateSpotlightValues(spotlightRadius);
      let minDistance = Infinity;
      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const distance = Math.hypot(e.clientX - cx, e.clientY - cy) - Math.max(r.width, r.height) / 2;
        const eff = Math.max(0, distance);
        minDistance = Math.min(minDistance, eff);
        let glow = 0;
        if (eff <= proximity) glow = 1;
        else if (eff <= fadeDistance) glow = (fadeDistance - eff) / (fadeDistance - proximity);
        updateCardGlowProperties(card, e.clientX, e.clientY, glow, spotlightRadius);
      });
      gsap.to(spotlightRef.current, { left: e.clientX, top: e.clientY, duration: 0.1, ease: "power2.out" });
      const targetOpacity =
        minDistance <= proximity ? 0.8 : minDistance <= fadeDistance ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8 : 0;
      gsap.to(spotlightRef.current, { opacity: targetOpacity, duration: targetOpacity > 0 ? 0.2 : 0.5, ease: "power2.out" });
    };
    const onLeave = () => {
      gridRef.current?.querySelectorAll<HTMLElement>(".magic-bento-card").forEach((c) => c.style.setProperty("--glow-intensity", "0"));
      if (spotlightRef.current) gsap.to(spotlightRef.current, { opacity: 0, duration: 0.3, ease: "power2.out" });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      spotlightRef.current?.parentNode?.removeChild(spotlightRef.current);
    };
  }, [gridRef, disableAnimations, enabled, spotlightRadius, glowColor]);

  return null;
}

interface MagicBentoProps {
  cards: BentoCard[];
  textAutoHide?: boolean;
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  glowColor?: string;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
}

export default function MagicBento({
  cards,
  textAutoHide = true,
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableTilt = false,
  glowColor = DEFAULT_GLOW_COLOR,
  clickEffect = true,
  enableMagnetism = true,
}: MagicBentoProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const shouldDisable = disableAnimations || isMobile;
  const baseClassName = `magic-bento-card ${textAutoHide ? "magic-bento-card--text-autohide" : ""} ${enableBorderGlow ? "magic-bento-card--border-glow" : ""}`;

  return (
    <>
      {enableSpotlight && (
        <GlobalSpotlight gridRef={gridRef} disableAnimations={shouldDisable} enabled={enableSpotlight} spotlightRadius={spotlightRadius} glowColor={glowColor} />
      )}
      <div className="card-grid bento-section" ref={gridRef}>
        {cards.map((card, i) => (
          <ParticleCard
            key={i}
            card={card}
            className={baseClassName}
            disableAnimations={shouldDisable}
            particleCount={particleCount}
            glowColor={glowColor}
            enableStars={enableStars}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          />
        ))}
      </div>
    </>
  );
}
