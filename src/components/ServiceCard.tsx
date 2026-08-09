import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/Pill";

export type ServiceCardTone = "navy" | "emerald" | "gold";
export type ServiceCardVariant = "feature" | "standard" | "compact";

const TONE_TILE: Record<ServiceCardTone, string> = {
  navy: "bg-navy/[0.07] text-navy",
  emerald: "bg-emerald-soft text-emerald",
  gold: "bg-gold/[0.14] text-gold-foreground",
};

const TONE_WASH: Record<ServiceCardTone, string> = {
  navy: "from-navy/[0.05] via-transparent",
  emerald: "from-emerald/[0.06] via-transparent",
  gold: "from-gold/[0.08] via-transparent",
};

export interface ServiceCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  meta?: string;
  description?: string;
  quickServices?: string[];
  ctaLabel?: string;
  variant?: ServiceCardVariant;
  tone?: ServiceCardTone;
  className?: string;
}

/**
 * The one reusable card component behind the whole "service explorer":
 * three variants (feature / standard / compact) give the grid genuine
 * visual rhythm instead of a repeated equal-size tile. Flat by default,
 * lifts with a soft shadow + border tint on hover — the single
 * interaction pattern reused everywhere.
 */
export function ServiceCard({
  href,
  icon,
  title,
  meta,
  description,
  quickServices,
  ctaLabel = "Explore services",
  variant = "standard",
  tone = "navy",
  className,
}: ServiceCardProps) {
  const isFeature = variant === "feature";
  const isCompact = variant === "compact";
  const external = /^https?:\/\//.test(href);

  const content = (
    <div
      className={cn(
        "card-hover group relative flex h-full flex-col overflow-hidden rounded-2xl border border-mist bg-white",
        isFeature && "rounded-3xl bg-gradient-to-br " + TONE_WASH[tone],
        isFeature ? "p-7 sm:p-8" : isCompact ? "p-5" : "p-6",
      )}
    >
      <div className={cn("flex items-start justify-between", isCompact ? "mb-3" : "mb-5")}>
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl",
            TONE_TILE[tone],
            isFeature ? "h-14 w-14" : isCompact ? "h-10 w-10" : "h-12 w-12"
          )}
        >
          {icon}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-mist text-fog opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-hover:border-navy/25 group-hover:text-navy sm:-translate-y-1 sm:translate-x-1">
          <ArrowUpRight size={15} />
        </span>
      </div>

      <div className="flex-1">
        {meta && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {meta}
          </p>
        )}
        <h3
          className={cn(
            "font-display font-bold leading-snug text-navy-deep",
            isFeature ? "text-[1.5rem] sm:text-[1.7rem]" : isCompact ? "text-[15px]" : "text-lg"
          )}
        >
          {title}
        </h3>
        {description && !isCompact && (
          <p className={cn("mt-2 text-[14px] leading-relaxed text-muted-foreground", isFeature ? "max-w-[85%]" : "line-clamp-2")}>
            {description}
          </p>
        )}
      </div>

      {quickServices && quickServices.length > 0 && !isCompact && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {quickServices.slice(0, isFeature ? 4 : 2).map((qs) => (
            <Pill key={qs} tone={tone === "gold" ? "gold" : tone === "emerald" ? "emerald" : "navy"}>
              {qs}
            </Pill>
          ))}
        </div>
      )}

      {!isCompact && (
        <div className="mt-6 flex items-center gap-1.5 text-[13px] font-semibold text-navy">
          {ctaLabel}
          <ArrowUpRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      )}
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn("block h-full", className)}>
        {content}
      </a>
    );
  }
  return (
    <Link to={href} className={cn("block h-full", className)}>
      {content}
    </Link>
  );
}
