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

  const dashLink = user?.role === "admin" ? "/admin" : user?.role === "staff" ? "/staff" : "/dashboard";
  const handleLogout = () => { logout(); navigate("/login"); setOpen(false); };
  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/services", label: "Services" },
    ...(user ? [{ to: dashLink, label: "Dashboard" }] : []),
  ];

  const roleColors: Record<string, string> = {
    admin: "bg-orange-500 text-white",
    staff: "bg-emerald-500 text-white",
    customer: "bg-blue-500 text-white",
  };

  return (
    <>
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-[#4f8ef7] via-[#6c63ff] to-[#38bdf8]" />
      <nav className={`sticky top-0 z-50 transition-all duration-300 bg-white ${scrolled ? "shadow-md" : "border-b border-gray-100"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-[60px] items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <img src={logoImg} alt="Mahabharat Consultancy" className="h-9 w-auto object-contain group-hover:scale-105 transition-transform duration-200" />
              <div className="hidden sm:block">
                <p className="text-[14px] font-bold leading-tight text-gray-900 tracking-tight">
                  Mahabharat Consultancy
                </p>
                <p className="text-[9px] text-blue-600 font-semibold tracking-[0.15em] uppercase">One Stop Service Center</p>
              </div>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(link => (
                <Link key={link.to} to={link.to}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(link.to) ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}>
                  {link.label}
                </Link>
              ))}

              <div className="w-px h-6 bg-gray-200 mx-2" />

              {user ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{user.name[0]}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{user.name.split(" ")[0]}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${roleColors[user.role]}`}>
                    {user.role === "admin" && <Crown size={10} />}
                    {user.role}
                  </span>
                  <button onClick={handleLogout}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Logout">
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate("/login")} className="text-gray-600 font-medium text-sm">
                    Sign In
                  </Button>
                  <Button size="sm" onClick={() => navigate("/signup")}
                    className="bg-gradient-to-r from-[#4f8ef7] to-[#6c63ff] hover:from-[#4080e8] hover:to-[#5d54f0] font-semibold text-xs shadow-md shadow-indigo-500/20">
                    Get Started <ChevronRight size={13} className="ml-0.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Mobile toggle */}
            <button onClick={() => setOpen(!open)}
              className="md:hidden w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div className={`md:hidden overflow-hidden transition-all duration-300 ${open ? "max-h-80 border-t" : "max-h-0"}`}>
          <div className="bg-white px-4 py-3 space-y-1">
            {navLinks.map(link => (
              <Link key={link.to} to={link.to} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.to) ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                }`}>
                {link.label === "Dashboard" && <LayoutDashboard size={16} />}
                {link.label}
              </Link>
            ))}
            {user ? (
              <div className="flex items-center justify-between pt-2 mt-2 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{user.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-[10px] text-gray-400 uppercase">{user.role}</p>
                  </div>
                </div>
                <button onClick={handleLogout} className="text-sm text-red-500 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50">Logout</button>
              </div>
            ) : (
              <div className="flex gap-2 pt-2 mt-2 border-t">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { navigate("/login"); setOpen(false); }}>Sign In</Button>
                <Button size="sm" className="flex-1 bg-blue-600" onClick={() => { navigate("/signup"); setOpen(false); }}>Get Started</Button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
