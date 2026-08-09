import { cn } from "@/lib/utils";

/**
 * Shared section intro used across Home: small pill eyebrow → Manrope
 * heading → optional Inter subtext. One component, reused by every
 * section so the editorial rhythm stays consistent end to end.
 */
export function SectionHeader({
  eyebrow,
  title,
  sub,
  align = "left",
  tone = "navy",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  align?: "left" | "center";
  tone?: "navy" | "white";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={cn("max-w-2xl", centered && "mx-auto text-center", className)}>
      {eyebrow && (
        <span
          className={cn(
            "eyebrow inline-flex items-center gap-2 rounded-full px-3.5 py-1.5",
            tone === "navy" ? "bg-navy/[0.06] text-navy" : "bg-white/10 text-white/85"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          {eyebrow}
        </span>
      )}
      <h2
        className={cn(
          "font-display text-[2rem] font-extrabold leading-[1.12] tracking-tight sm:text-[2.5rem]",
          eyebrow && "mt-4",
          tone === "navy" ? "text-navy-deep" : "text-white"
        )}
      >
        {title}
      </h2>
      {sub && (
        <p
          className={cn(
            "mt-3.5 text-[15px] leading-relaxed sm:text-base",
            tone === "navy" ? "text-muted-foreground" : "text-white/65"
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
