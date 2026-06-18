import {
  Fingerprint, CreditCard, Vote, BookUser, BadgeIndianRupee, Home as HomeIcon,
  ScrollText, Baby, FileText, Car, Receipt, ReceiptText, Landmark, Truck,
  FileSpreadsheet, Factory, Award, School, ClipboardList, Shield, Anchor,
  Plane, Briefcase, Ticket, ClipboardCheck, GraduationCap, NotebookPen,
  PencilLine, Keyboard, Printer, ScanLine, Copy, Layers, Camera, Zap,
  Droplets, Smartphone, Tv, CarFront, Building2, ShoppingCart, ShoppingBag,
  Sparkles, type LucideIcon,
} from "lucide-react";

// Distinct icon per service (matched to the catalog slugs), CSC-style.
const SERVICE_ICONS: Record<string, LucideIcon> = {
  // Government documents
  "aadhaar-update": Fingerprint,
  "pan-card": CreditCard,
  "voter-id": Vote,
  "passport": BookUser,
  "income-certificate": BadgeIndianRupee,
  "domicile-certificate": HomeIcon,
  "caste-certificate": ScrollText,
  "birth-certificate": Baby,
  "death-certificate": FileText,
  "driving-license": Car,
  // Tax & GST
  "gst-registration": Receipt,
  "gst-returns": ReceiptText,
  "itr-filing": Landmark,
  "eway-bill": Truck,
  "gst-billing-excel": FileSpreadsheet,
  "factory-billing": Factory,
  // Exams & jobs
  "scholarship-forms": Award,
  "admission-forms": School,
  "exam-form-filling": ClipboardList,
  "army-exam": Shield,
  "navy-exam": Anchor,
  "airforce-exam": Plane,
  "govt-job-forms": Briefcase,
  "hall-ticket": Ticket,
  "result-checking": ClipboardCheck,
  "marksheet-print": GraduationCap,
  // Document services
  "resume": NotebookPen,
  "online-form-filling": PencilLine,
  "document-typing": Keyboard,
  "printing": Printer,
  "scanning": ScanLine,
  "xerox": Copy,
  "lamination": Layers,
  "passport-photos": Camera,
  // Bills & recharge
  "electricity-bill": Zap,
  "water-bill": Droplets,
  "mobile-recharge": Smartphone,
  "dth-recharge": Tv,
  "fastag-recharge": CarFront,
  // Business
  "company-registration": Building2,
  "amazon-seller": ShoppingCart,
  "flipkart-seller": ShoppingBag,
  // Other
  "other-service": Sparkles,
};

export function serviceIcon(slug?: string): LucideIcon {
  return (slug && SERVICE_ICONS[slug]) || FileText;
}

// Colourful, realistic emoji per service (rendered as the card icon).
const SERVICE_EMOJI: Record<string, string> = {
  // Government documents
  "aadhaar-update": "🪪",
  "pan-card": "💳",
  "voter-id": "🗳️",
  "passport": "🛂",
  "income-certificate": "💰",
  "domicile-certificate": "🏠",
  "caste-certificate": "📜",
  "birth-certificate": "👶",
  "death-certificate": "📄",
  "driving-license": "🚗",
  // Tax & GST
  "gst-registration": "🧾",
  "gst-returns": "📑",
  "itr-filing": "🏛️",
  "eway-bill": "🚚",
  "gst-billing-excel": "📊",
  "factory-billing": "🏭",
  // Exams & jobs
  "scholarship-forms": "🎓",
  "admission-forms": "🏫",
  "exam-form-filling": "📝",
  "army-exam": "🎖️",
  "navy-exam": "⚓",
  "airforce-exam": "✈️",
  "govt-job-forms": "💼",
  "hall-ticket": "🎫",
  "result-checking": "✅",
  "marksheet-print": "📃",
  // Document services
  "resume": "📄",
  "online-form-filling": "🖊️",
  "document-typing": "⌨️",
  "printing": "🖨️",
  "scanning": "📠",
  "xerox": "📑",
  "lamination": "🗂️",
  "passport-photos": "📸",
  // Bills & recharge
  "electricity-bill": "💡",
  "water-bill": "💧",
  "mobile-recharge": "📱",
  "dth-recharge": "📺",
  "fastag-recharge": "🛣️",
  // Business
  "company-registration": "🏢",
  "amazon-seller": "🛒",
  "flipkart-seller": "🛍️",
  // Other
  "other-service": "✨",
};

export function serviceEmoji(slug?: string): string {
  return (slug && SERVICE_EMOJI[slug]) || "📋";
}

// Per-service image icon — DROP-IN: add an image named "<slug>.png" (or .svg/
// .jpg/.webp) into src/assets/services/ and it is auto-detected at build time
// (Vite import.meta.glob) and shown on the card; otherwise the emoji is used.
// e.g. src/assets/services/pan-card.png  →  shows on the PAN Card card.
const SERVICE_IMAGE_MODULES = import.meta.glob(
  "../assets/services/*.{png,svg,jpg,jpeg,webp}",
  { eager: true, import: "default" }
) as Record<string, string>;

const SERVICE_IMAGE: Record<string, string> = {};
for (const path in SERVICE_IMAGE_MODULES) {
  const slug = path.split("/").pop()!.replace(/\.(png|svg|jpe?g|webp)$/i, "");
  SERVICE_IMAGE[slug] = SERVICE_IMAGE_MODULES[path];
}

export function serviceImage(slug?: string): string | undefined {
  return slug ? SERVICE_IMAGE[slug] : undefined;
}
