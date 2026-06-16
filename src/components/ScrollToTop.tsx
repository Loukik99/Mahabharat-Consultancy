import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Resets scroll to the top on every route change. Without this, react-router
// keeps the previous scroll position, so navigating (logo, service cards,
// links) opens the new page scrolled to the middle/bottom.
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}
