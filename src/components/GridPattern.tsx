import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free take on Magic UI's "Animated Grid Pattern" —
 * a faint SVG grid with a few cells that softly pulse. Used only as a
 * subtle texture behind dark surfaces (hero / CTA band), never flashy.
 */
export function GridPattern({ className, cellSize = 44 }: { className?: string; cellSize?: number }) {
  const id = useId();
  const highlights = [
    { x: 3, y: 1, delay: "0s" },
    { x: 7, y: 2, delay: "1.4s" },
    { x: 5, y: 4, delay: "2.8s" },
  ];

  return (
    <svg className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} aria-hidden="true">
      <defs>
        <pattern id={`grid-${id}`} width={cellSize} height={cellSize} patternUnits="userSpaceOnUse">
          <path d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`} fill="none" stroke="currentColor" strokeOpacity="0.06" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#grid-${id})`} />
      {highlights.map((h, i) => (
        <rect
          key={i}
          x={h.x * cellSize}
          y={h.y * cellSize}
          width={cellSize}
          height={cellSize}
          fill="currentColor"
          opacity="0"
        >
          <animate attributeName="opacity" values="0;0.10;0" dur="4.5s" begin={h.delay} repeatCount="indefinite" />
        </rect>
      ))}
    </svg>
  );
}
