import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExplorerCardSize = "feature" | "emphasis" | "standard";
export type ExplorerCardTone = "navy" | "emerald" | "gold";

const TONE_TILE: Record<ExplorerCardTone, string> = {
  navy: "bg-navy/[0.08] text-navy",
  emerald: "bg-emerald-soft text-emerald",
  gold: "bg-gold/[0.16] text-navy",
};

const TONE_TAG: Record<ExplorerCardTone, string> = {
  navy: "bg-navy/[0.06] text-navy",
  emerald: "bg-emerald-soft text-emerald",
  gold: "bg-gold/[0.14] text-navy",
};

export interface ServiceExplorerCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  quickItems?: string[];
  ctaLabel?: string;
  size?: ExplorerCardSize;
  tone?: ExplorerCardTone;
  className?: string;
}

/**
 * Homepage services explorer card. Visual design is unchanged; equal card
 * dimensions come from the Home CSS Grid (fixed auto-rows) plus this rigid
 * internal layout — clamped title/description, fixed tag slot, CTA pinned
 * to the bottom. Content never drives card height.
 */
export function ServiceExplorerCard({
  href,
  icon,
  title,
  description,
  quickItems,
  ctaLabel = "Explore services",
  size = "standard",
  tone = "navy",
  className,
}: ServiceExplorerCardProps) {
  const isFeature = size === "feature";
  const isEmphasis = size === "emphasis";
  const external = /^https?:\/\//.test(href);
  const tags = (quickItems ?? []).slice(0, isFeature ? 5 : isEmphasis ? 4 : 3);

  const content = (
    <div
      className={cn(
        "group relative flex h-full min-h-0 w-full flex-col overflow-hidden border border-mist bg-white",
        "transition-[transform,box-shadow,border-color] duration-300 ease-out",
        "hover:-translate-y-1.5 hover:scale-[1.012] hover:border-gold/60 hover:shadow-elevated",
        "shadow-subtle",
        isFeature ? "rounded-[32px] p-8 sm:p-9" : isEmphasis ? "rounded-[28px] p-7 sm:p-8" : "rounded-[24px] p-6"
      )}
    >
      <div className={cn("flex shrink-0 items-start justify-between", isFeature ? "mb-6" : "mb-4")}>
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 ease-out group-hover:scale-110",
            TONE_TILE[tone],
            isFeature ? "h-14 w-14" : isEmphasis ? "h-12 w-12" : "h-10 w-10"
          )}
        >
          {icon}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-mist text-fog opacity-0 transition-all duration-300 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:border-gold/50 group-hover:text-navy group-hover:opacity-100">
          <ArrowUpRight size={14} />
        </span>
      </div>

      <h3
        className={cn(
          "shrink-0 overflow-hidden font-display font-bold leading-snug text-ink",
          isFeature
            ? "h-[3.3rem] text-[1.5rem] sm:h-[3.6rem] sm:text-[1.65rem]"
            : isEmphasis
            ? "h-[2.6rem] text-[1.2rem]"
            : "h-[2.9rem] text-[1.05rem]",
          "line-clamp-2"
        )}
      >
        {title}
      </h3>
      <p
        className={cn(
          "mt-2 shrink-0 overflow-hidden leading-relaxed text-smoke line-clamp-2",
          isFeature ? "h-[3rem] max-w-[90%] text-[14.5px]" : "h-[2.75rem] text-[13.5px]"
        )}
      >
        {description}
      </p>

      {/* Fixed tag slot — same height on every card, regardless of tag count. */}
      <div
        className={cn(
          "flex shrink-0 flex-wrap content-start gap-1.5 overflow-hidden",
          isFeature ? "mt-6 h-[56px]" : "mt-5 h-[52px]"
        )}
      >
        {tags.map((item) => (
          <span
            key={item}
            className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", TONE_TAG[tone])}
          >
            {item}
          </span>
        ))}
      </div>

      <div className="relative mt-auto inline-flex w-fit shrink-0 items-center gap-1.5 pt-6 text-[13px] font-semibold text-navy">
        {ctaLabel}
        <ArrowUpRight size={13} className="transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        <span className="absolute bottom-0 left-0 h-px w-0 bg-navy transition-all duration-300 ease-out group-hover:w-[calc(100%-15px)]" />
      </div>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn("block h-full min-h-0 w-full cursor-pointer", className)}>
        {content}
      </a>
    );
  }
  return (
    <Link to={href} className={cn("block h-full min-h-0 w-full cursor-pointer", className)}>
      {content}
    </Link>
  );
}
