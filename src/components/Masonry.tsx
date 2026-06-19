import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import "./Masonry.css";

// Adapted from reactbits.dev "Masonry" — converted to TS and made to render
// text content cards (title + label + description) instead of images, themed
// navy/gold, with in-app navigation on click.

export interface MasonryItem {
  id: string;
  href: string;        // internal route (e.g. /services/pan-card) or external http(s)
  height: number;      // tile height in px (drives the masonry layout)
  title: string;
  label?: string;
  description?: string;
  icon?: ReactNode;    // optional icon/image rendered at the top of the card
}

const useMedia = (queries: string[], values: number[], defaultValue: number): number => {
  const get = () => values[queries.findIndex((q) => matchMedia(q).matches)] ?? defaultValue;
  const [value, setValue] = useState<number>(get);
  useEffect(() => {
    const handler = () => setValue(get);
    queries.forEach((q) => matchMedia(q).addEventListener("change", handler));
    return () => queries.forEach((q) => matchMedia(q).removeEventListener("change", handler));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries]);
  return value;
};

const useMeasure = (): [React.RefObject<HTMLDivElement>, { width: number; height: number }] => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    measure(); // immediate, so the grid lays out on first paint
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return [ref, size];
};

interface MasonryProps {
  items: MasonryItem[];
  columnsConfig?: number[]; // [>=1500, >=1000, >=600, >=400] columns
  ease?: string;
  duration?: number;
  stagger?: number;
  animateFrom?: "top" | "bottom" | "left" | "right" | "center";
  scaleOnHover?: boolean;
  hoverScale?: number;
  blurToFocus?: boolean;
  animate?: boolean;
}

export default function Masonry({
  items,
  columnsConfig = [4, 3, 2, 2],
  ease = "power3.out",
  duration = 0.6,
  stagger = 0.05,
  animateFrom = "bottom",
  scaleOnHover = true,
  hoverScale = 1.03,
  blurToFocus = true,
  animate = true,
}: MasonryProps) {
  const navigate = useNavigate();
  const columns = useMedia(
    ["(min-width:1500px)", "(min-width:1000px)", "(min-width:600px)", "(min-width:400px)"],
    columnsConfig,
    1
  );
  const [containerRef, { width }] = useMeasure();

  const { grid, containerHeight } = useMemo(() => {
    if (!width) return { grid: [] as (MasonryItem & { x: number; y: number; w: number; h: number })[], containerHeight: 0 };
    const colHeights = new Array(columns).fill(0);
    const columnWidth = width / columns;
    const placed = items.map((child) => {
      const col = colHeights.indexOf(Math.min(...colHeights));
      const x = columnWidth * col;
      const h = child.height;
      const y = colHeights[col];
      colHeights[col] += h;
      return { ...child, x, y, w: columnWidth, h };
    });
    return { grid: placed, containerHeight: Math.max(0, ...colHeights) };
  }, [columns, items, width]);

  const getInitialPosition = (item: { x: number; y: number; w: number; h: number }) => {
    switch (animateFrom) {
      case "top": return { x: item.x, y: -200 };
      case "bottom": return { x: item.x, y: window.innerHeight + 200 };
      case "left": return { x: -200, y: item.y };
      case "right": return { x: window.innerWidth + 200, y: item.y };
      case "center": return { x: item.x, y: item.y };
      default: return { x: item.x, y: item.y + 80 };
    }
  };

  const hasMounted = useRef(false);

  useLayoutEffect(() => {
    if (!width) return;
    grid.forEach((item, index) => {
      const selector = `[data-key="${item.id}"]`;
      const props = { x: item.x, y: item.y, width: item.w, height: item.h };
      if (!hasMounted.current && animate) {
        const init = getInitialPosition(item);
        gsap.fromTo(
          selector,
          { opacity: 0, x: init.x, y: init.y, width: item.w, height: item.h, ...(blurToFocus && { filter: "blur(10px)" }) },
          { opacity: 1, ...props, ...(blurToFocus && { filter: "blur(0px)" }), duration: 0.8, ease: "power3.out", delay: index * stagger }
        );
      } else {
        gsap.to(selector, { opacity: 1, ...props, duration: hasMounted.current ? duration : 0, ease, overwrite: "auto" });
      }
    });
    hasMounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, width]);

  const open = (item: MasonryItem) => {
    if (/^https?:\/\//.test(item.href)) window.open(item.href, "_blank", "noopener");
    else navigate(item.href);
  };

  const onEnter = (id: string) => scaleOnHover && gsap.to(`[data-key="${id}"]`, { scale: hoverScale, duration: 0.3, ease: "power2.out" });
  const onLeave = (id: string) => scaleOnHover && gsap.to(`[data-key="${id}"]`, { scale: 1, duration: 0.3, ease: "power2.out" });

  return (
    <div ref={containerRef} className="masonry-list" style={{ height: containerHeight }}>
      {grid.map((item) => (
        <div
          key={item.id}
          data-key={item.id}
          className="masonry-item"
          onClick={() => open(item)}
          onMouseEnter={() => onEnter(item.id)}
          onMouseLeave={() => onLeave(item.id)}
        >
          <div className="masonry-card">
            <div>
              {item.icon && <div className="masonry-card__icon">{item.icon}</div>}
              {item.label && <span className="masonry-card__label">{item.label}</span>}
            </div>
            <div className="masonry-card__body">
              <h3 className="masonry-card__title">{item.title}</h3>
              {item.description && <p className="masonry-card__desc">{item.description}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
