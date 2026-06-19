import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import "./AnimatedList.css";

/** A single row that scales + fades in once it scrolls into view. */
function AnimatedItem({
  children,
  index,
  onMouseEnter,
  onClick,
}: {
  children: ReactNode;
  index: number;
  onMouseEnter?: () => void;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let delivered = false;
    let raf1 = 0;
    let raf2 = 0;
    const obs = new IntersectionObserver(
      ([entry]) => {
        delivered = true;
        if (entry.isIntersecting) {
          // Defer the reveal two frames. IO's first callback can fire before the
          // browser paints the hidden start state; waiting two rAFs guarantees
          // that hidden frame is painted, so the CSS transition has a "from"
          // state and the scale + fade actually animates.
          raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => setInView(true));
          });
        } else {
          setInView(false);
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    // Safety net: if IO never delivers (rare/headless), reveal so content is
    // never stuck hidden.
    const t = window.setTimeout(() => {
      if (!delivered) setInView(true);
    }, 1200);
    return () => {
      obs.disconnect();
      window.clearTimeout(t);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className="al-item-wrap"
      style={{
        transform: inView ? "scale(1)" : "scale(0.7)",
        opacity: inView ? 1 : 0,
        // Cascade in on entrance; collapse instantly on exit.
        transitionDelay: inView ? `${Math.min(index, 8) * 70}ms` : "0ms",
      }}
    >
      {children}
    </div>
  );
}

interface AnimatedListProps {
  items?: ReactNode[];
  onItemSelect?: (item: ReactNode, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  itemClassName?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
}

export default function AnimatedList({
  items = [],
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  className = "",
  itemClassName = "",
  displayScrollbar = true,
  initialSelectedIndex = -1,
}: AnimatedListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

  const updateGradients = useCallback((el: HTMLDivElement) => {
    const { scrollTop, scrollHeight, clientHeight } = el;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => updateGradients(e.currentTarget),
    [updateGradients]
  );

  // Recompute edge fades when content changes (so short, non-scrolling lists
  // don't show a permanent bottom fade over the last item).
  useEffect(() => {
    if (listRef.current) updateGradients(listRef.current);
  }, [items, updateGradients]);

  // Arrow / Enter navigation (opt-in — disabled inside forms so Tab isn't hijacked).
  useEffect(() => {
    if (!enableArrowNavigation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < items.length) {
        e.preventDefault();
        onItemSelect?.(items[selectedIndex], selectedIndex);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items, selectedIndex, onItemSelect, enableArrowNavigation]);

  // Keep the keyboard-selected row in view.
  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) return;
    const container = listRef.current;
    const selected = container.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (selected) {
      const margin = 40;
      const top = selected.offsetTop;
      const bottom = top + selected.offsetHeight;
      if (top < container.scrollTop + margin) {
        container.scrollTo({ top: top - margin, behavior: "smooth" });
      } else if (bottom > container.scrollTop + container.clientHeight - margin) {
        container.scrollTo({ top: bottom - container.clientHeight + margin, behavior: "smooth" });
      }
    }
    setKeyboardNav(false);
  }, [selectedIndex, keyboardNav]);

  return (
    <div className={`al-container ${className}`}>
      <div
        ref={listRef}
        className={`al-list ${!displayScrollbar ? "no-scrollbar" : ""}`}
        onScroll={handleScroll}
      >
        {items.map((item, index) => (
          <AnimatedItem
            key={index}
            index={index}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => {
              setSelectedIndex(index);
              onItemSelect?.(item, index);
            }}
          >
            <div className={`al-item ${selectedIndex === index ? "selected" : ""} ${itemClassName}`}>
              {typeof item === "string" ? <p className="al-item-text">{item}</p> : item}
            </div>
          </AnimatedItem>
        ))}
      </div>
      {showGradients && (
        <>
          <div className="al-top-gradient" style={{ opacity: topGradientOpacity }} />
          <div className="al-bottom-gradient" style={{ opacity: bottomGradientOpacity }} />
        </>
      )}
    </div>
  );
}
