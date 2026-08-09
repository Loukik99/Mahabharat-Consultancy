import { cn } from "@/lib/utils";

const TONES = {
  navy: "bg-navy/[0.07] text-navy",
  gold: "bg-gold/[0.14] text-gold-foreground",
  emerald: "bg-emerald-soft text-emerald",
  white: "bg-white/10 text-white/85 ring-1 ring-inset ring-white/15",
  outline: "border border-mist bg-white text-ink",
} as const;

/**
 * Small rounded-full tag — used for quick-service chips, trust
 * indicators, category labels and status pills across the site.
 */
export function Pill({
  children,
  tone = "navy",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
