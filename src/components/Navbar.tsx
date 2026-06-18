import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, LayoutDashboard, ChevronRight, Crown } from "lucide-react";
import logoImg from "@/assets/logo.jpeg";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const dashLink = user?.role === "admin" ? "/admin" : user?.role === "agent" ? "/agent" : "/dashboard";
  const handleLogout = () => { logout(); navigate("/login"); setOpen(false); };
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
    customer: "bg-secondary text-navy",
  };

  return (
    <>
      <div className="gold-rule" />
      <nav className={`sticky top-0 z-50 bg-background/95 backdrop-blur transition-shadow ${scrolled ? "shadow-[0_1px_0_hsl(var(--border)),0_8px_24px_-12px_rgba(11,30,58,0.25)]" : "border-b border-border"}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <img src={logoImg} alt="Mahabharat Consultancy" className="h-10 w-auto object-contain" />
              <div className="hidden sm:block leading-tight">
                <p className="font-display text-[15px] font-semibold tracking-tight text-navy">Mahabharat Consultancy</p>
                <p className="eyebrow text-[9px] text-gold">One Stop Service Center</p>
              </div>
            </Link>

            {/* Desktop nav */}
            <div className="hidden items-center gap-1 md:flex">
              {navLinks.map((link) => (
                <Link key={link.to} to={link.to}
                  className={`relative px-3.5 py-2 text-sm font-medium transition-colors ${
                    isActive(link.to) ? "text-navy" : "text-muted-foreground hover:text-navy"
                  }`}>
                  {link.label}
                  {isActive(link.to) && <span className="absolute inset-x-3.5 -bottom-px h-0.5 bg-gold" />}
                </Link>
              ))}

              <div className="mx-3 h-6 w-px bg-border" />

              {user ? (
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-2 rounded bg-secondary/70 px-2.5 py-1.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">
                      {user.name[0]}
                    </div>
                    <span className="text-sm font-medium text-navy">{user.name.split(" ")[0]}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${roleColors[user.role]}`}>
                    {user.role === "admin" && <Crown size={10} />}
                    {user.role}
                  </span>
                  <button onClick={handleLogout} title="Logout"
                    className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="font-medium text-navy hover:text-navy">
                    Sign In
                  </Button>
                  <Button size="sm" onClick={() => navigate("/signup")} className="bg-gold font-semibold text-gold-foreground hover:bg-gold/90">
                    Get Started <ChevronRight size={14} className="ml-0.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Mobile toggle */}
            <button onClick={() => setOpen(!open)}
              className="flex h-9 w-9 items-center justify-center rounded border border-border md:hidden">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div className={`overflow-hidden border-t border-border transition-all duration-300 md:hidden ${open ? "max-h-96" : "max-h-0 border-t-0"}`}>
          <div className="space-y-1 px-4 py-3">
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium ${
                  isActive(link.to) ? "bg-secondary text-navy" : "text-muted-foreground hover:bg-secondary/60"
                }`}>
                {link.label === "Dashboard" && <LayoutDashboard size={16} />}
                {link.label}
              </Link>
            ))}
            {user ? (
              <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-gold">{user.name[0]}</div>
                  <div>
                    <p className="text-sm font-medium text-navy">{user.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{user.role}</p>
                  </div>
                </div>
                <button onClick={handleLogout} className="rounded px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10">Logout</button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { navigate("/login"); setOpen(false); }}>Sign In</Button>
                <Button size="sm" className="flex-1 bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => { navigate("/signup"); setOpen(false); }}>Get Started</Button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
