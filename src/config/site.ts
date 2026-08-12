// ──────────────────────────────────────────────────────────────────
// Shop / business details.
//
// These are PLACEHOLDERS to be confirmed with the client. Update them
// in one place and they propagate across the site (footer, contact,
// WhatsApp button, map).
// ──────────────────────────────────────────────────────────────────
export const site = {
  name: "Mahabharat Consultancy",
  tagline: "Where Convenience Meets Reliability",
  ownerName: "Owner Name (to be confirmed)",
  address: "G.I.T College Road, Udyambag, Belagavi, Karnataka 590008",
  phone: "+91 89709 34940",
  whatsapp: "918970934940", // digits only, country code first — used in wa.me links
  email: "info.mahabharatgroup@gmail.com",
  workingHours: "Mon–Sat, 9:00 AM – 8:00 PM",
  // Official Maps embed URL (no API key). Update the address segment for a new pin.
  mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m2!2m1!1sG.I.T+College+Road,+Udyambag,+Belagavi,+Karnataka+590008",
  // Full Google Maps page (not the embed), used for "View on Google Maps" links/buttons.
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=G.I.T+College+Road,+Udyambag,+Belagavi,+Karnataka+590008",
  // UPI payment details (from the shop's GPay/ICICI QR).
  upiId: "ghansham40@icici",
  upiPayeeName: "GHANSHAM MAHADEV BAGEWADIKAR",
  upiBank: "ICICI Bank",
  // Scanner image in /public — shown in the payment section.
  upiQrImage: "Scanner.jpeg",
};

export const waLink = (message?: string) =>
  `https://wa.me/${site.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ""}`;

// UPI deep link — opens the customer's UPI app pre-filled with the payee.
// Amount is intentionally omitted (price is confirmed by the shop per request).
export const upiPayLink = (note?: string) =>
  `upi://pay?pa=${encodeURIComponent(site.upiId)}&pn=${encodeURIComponent(site.upiPayeeName)}&cu=INR${
    note ? `&tn=${encodeURIComponent(note)}` : ""
  }`;
