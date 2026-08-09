import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogOut, ArrowRight, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import logoImg from "@/assets/logo.png";

// Desktop-only navbar (mobile uses the StaggeredMenu in App.tsx). A single
// floating, pill-shaped container sits just off the top of the page at all
// times: logo, links and auth actions all live inside one rounded bar,
// gaining a slightly firmer shadow once the page scrolls underneath it.
export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const dashLink = user?.role === "admin" ? "/admin" : user?.role === "agent" ? "/agent" : "/dashboard";
  const handleLogout = () => { logout(); navigate("/login"); };
  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/services", label: "Services" },
    { to: "/jobs", label: "Govt Jobs" },
    ...(user ? [{ to: dashLink, label: "Dashboard" }] : []),
  ];

  const roleColors: Record<string, string> = {
    admin: "bg-gold text-gold-foreground",
    agent: "bg-navy text-white",
    customer: "bg-navy/[0.08] text-navy",
  };

  return (
    // Full-bleed pure white strip so the navbar and page share one surface.
    // No cream/gray side regions; only the floating pill has a hairline border.
    <div className="sticky top-0 z-50 w-full bg-white px-4 pt-4 sm:pt-5">
      <nav
        className={cn(
          "mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border bg-white transition-shadow duration-300",
          scrolled ? "border-mist shadow-nav-float" : "border-mist/60 shadow-subtle"
        )}
      >
        <div className="flex w-full items-center justify-between gap-4 px-3 py-2.5 sm:px-5">
          {/* Logo */}
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <img
              src={logoImg}
              alt="Mahabharat Consultancy"
              className="brand-logo h-11 w-auto sm:h-12"
              width={48}
              height={58}
              decoding="async"
            />
            <div className="leading-tight">
              <p className="font-display text-[13.5px] font-bold tracking-tight text-ink">Mahabharat Consultancy</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-gold">Where Convenience Meets Reliability</p>
            </div>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "rounded-full px-4 py-2.5 text-[13.5px] font-medium transition-colors",
                  isActive(link.to) ? "bg-ink/[0.05] text-ink" : "text-fog hover:text-ink"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth actions */}
          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <>
                <div className="hidden items-center gap-2 rounded-full bg-ink/[0.04] py-1.5 pl-1.5 pr-3 sm:flex">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] font-bold text-gold">
                    {user.name[0]}
                  </div>
                  <span className="text-[12.5px] font-semibold text-ink">{user.name.split(" ")[0]}</span>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", roleColors[user.role])}>
                    {user.role === "admin" && <Crown size={8} />}
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-fog transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="rounded-full px-4 py-2.5 text-[13.5px] font-medium text-fog transition-colors hover:text-ink"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate("/signup")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-navy px-[18px] py-2.5 text-[13.5px] font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.06)] transition-colors hover:bg-navy/90"
                >
                  Get Started <ArrowRight size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
