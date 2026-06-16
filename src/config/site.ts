// ──────────────────────────────────────────────────────────────────
// Shop / business details.
//
// These are PLACEHOLDERS to be confirmed with the client. Update them
// in one place and they propagate across the site (footer, contact,
// WhatsApp button, map).
// ──────────────────────────────────────────────────────────────────
export const site = {
  name: "Mahabharat Consultancy",
  tagline: "One Stop Service Center",
  ownerName: "Owner Name (to be confirmed)",
  address: "G.I.T College Road, Udyambag, Belagavi, Karnataka 590008",
  phone: "+91 89709 34940",
  whatsapp: "918970934940", // digits only, country code first — used in wa.me links
  email: "info@mahabharatconsultancy.in",
  workingHours: "Mon–Sat, 9:00 AM – 8:00 PM",
  // Replace the q= value with the real shop address for an accurate pin.
  mapEmbedUrl: "https://www.google.com/maps?q=G.I.T+College+Road,+Udyambag,+Belagavi,+Karnataka+590008&output=embed",
  // UPI placeholder for the payment QR section (to be replaced with the real VPA).
  upiId: "mahabharat@upi",
  upiPayeeName: "Mahabharat Consultancy",
};

export const waLink = (message?: string) =>
  `https://wa.me/${site.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
