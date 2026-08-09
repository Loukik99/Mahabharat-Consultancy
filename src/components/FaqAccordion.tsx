import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Premium accordion for the FAQ section: each question is its own
 * rounded, hairline-bordered row with a large click target, and the
 * answer expands with a grid-rows transition, so the animation stays
 * smooth no matter how long the answer text is (no guessed max-height).
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className={cn(
              "rounded-[20px] border bg-white transition-colors duration-300",
              isOpen ? "border-navy/15 shadow-subtle" : "border-mist"
            )}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left sm:px-7 sm:py-6"
              aria-expanded={isOpen}
            >
              <span className="font-display text-[15px] font-bold leading-snug text-navy-deep sm:text-[16px]">
                {item.q}
              </span>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                  isOpen ? "rotate-45 bg-gold text-gold-foreground" : "bg-ink/[0.05] text-ink"
                )}
              >
                <Plus size={16} />
              </span>
            </button>
            <div className={cn("faq-panel", isOpen && "is-open")}>
              <div>
                <p className="px-6 pb-6 text-[14px] leading-relaxed text-smoke sm:px-7 sm:pb-7">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
