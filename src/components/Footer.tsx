import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, ArrowUpRight } from "lucide-react";
import logoImg from "@/assets/logo.jpeg";

const links = {
  g2c: [
    { to: "/services?category=government", label: "Aadhar Card" },
    { to: "/services?category=government", label: "PAN Card" },
    { to: "/services?category=government", label: "Passport" },
    { to: "/services?category=government", label: "Driving License" },
    { to: "/services?category=government", label: "Certificates" },
  ],
  b2c: [
    { to: "/services?category=home", label: "Home Services" },
    { to: "/services?category=housekeeping", label: "Housekeeping" },
    { to: "/services?category=manpower", label: "Manpower Supply" },
    { to: "/services?category=ecommerce", label: "E-Commerce Setup" },
  ],
  company: [
    { to: "/services", label: "All Services" },
    { to: "/login", label: "Customer Login" },
    { to: "/signup", label: "Create Account" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-gradient-to-b from-[#f0f4ff] to-[#e8eeff] text-gray-500 mt-auto border-t border-indigo-100">
      {/* Vibrant accent bar */}
      <div className="h-1 bg-gradient-to-r from-[#4f8ef7] via-[#6c63ff] to-[#38bdf8]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img src={logoImg} alt="MB" className="h-10 w-auto" />
              <div>
                <p className="text-gray-900 font-bold text-sm">Mahabharat Consultancy</p>
                <p className="text-[9px] text-indigo-500 tracking-[0.15em] uppercase font-semibold">One Stop Service Center</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed">Your trusted platform for government documents and home services across Maharashtra.</p>
          </div>

          {/* G2C */}
          <div>
            <h4 className="text-gray-800 font-semibold text-xs uppercase tracking-wider mb-4">G2C Services</h4>
            <div className="space-y-2">
              {links.g2c.map(l => (
                <Link key={l.label} to={l.to} className="flex items-center gap-1 text-sm hover:text-indigo-600 transition-colors group">
                  {l.label}
                  <ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* B2C */}
          <div>
            <h4 className="text-gray-800 font-semibold text-xs uppercase tracking-wider mb-4">B2C Services</h4>
            <div className="space-y-2">
              {links.b2c.map(l => (
                <Link key={l.label} to={l.to} className="flex items-center gap-1 text-sm hover:text-indigo-600 transition-colors group">
                  {l.label}
                  <ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-gray-800 font-semibold text-xs uppercase tracking-wider mb-4">Quick Links</h4>
            <div className="space-y-2">
              {links.company.map(l => (
                <Link key={l.label} to={l.to} className="flex items-center gap-1 text-sm hover:text-indigo-600 transition-colors group">
                  {l.label}
                  <ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-gray-800 font-semibold text-xs uppercase tracking-wider mb-4">Helpdesk</h4>
            <div className="space-y-3 text-sm">
              <a href="tel:+919876543210" className="flex items-center gap-2.5 hover:text-indigo-600 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                  <Phone size={14} className="text-indigo-500" />
                </div>
                +91 98765 43210
              </a>
              <a href="mailto:info@mahabharat.com" className="flex items-center gap-2.5 hover:text-indigo-600 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                  <Mail size={14} className="text-indigo-500" />
                </div>
                info@mahabharat.com
              </a>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                  <MapPin size={14} className="text-indigo-500" />
                </div>
                Mumbai, Maharashtra
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-indigo-100 mt-10 pt-5 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Mahabharat Consultancy Services. All rights reserved.</p>
          <div className="flex gap-5 text-xs text-gray-400">
            <span className="hover:text-gray-400 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-gray-400 cursor-pointer">Terms of Service</span>
            <span className="hover:text-gray-400 cursor-pointer">Refund Policy</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
