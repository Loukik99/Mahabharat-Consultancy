/* ═══════════════════════════════════════════════════════
   MAHABHARAT CONSULTANCY — LANDING PAGE
   Simple scroll animations + service links
   ═══════════════════════════════════════════════════════ */

// ── Resolve app links (dev: localhost:5174, prod: same domain) ──
const APP_BASE = (location.port === '5175' || location.port === '5176')
  ? 'http://localhost:5174'
  : '';

document.querySelectorAll('[data-app-link]').forEach(el => {
  el.href = APP_BASE + el.dataset.appLink;
});

// ── Lenis smooth scroll ──────────────────────────────────
const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

// ── Navbar scroll effect ─────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// ── Mobile nav toggle ────────────────────────────────────
const navToggle = document.getElementById('nav-toggle');
const navMobile = document.getElementById('nav-mobile');
navToggle.addEventListener('click', () => {
  navToggle.classList.toggle('open');
  navMobile.classList.toggle('open');
});
navMobile.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    navToggle.classList.remove('open');
    navMobile.classList.remove('open');
  });
});

// ── Scroll-triggered fade-in ─────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
