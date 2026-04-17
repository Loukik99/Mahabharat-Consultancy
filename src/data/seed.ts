import type { User, Service, Booking, Payment } from "@/types";

// ── Storage helpers ───────────────────────────────────────────────
function load<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function persist(): void {
  try { localStorage.setItem("mb_users", JSON.stringify(users)); } catch {}
  try { localStorage.setItem("mb_payments", JSON.stringify(payments)); } catch {}
  try { localStorage.setItem("mb_id", String(_id)); } catch {}
  // Bookings may contain large base64 doc URLs — try with docs, fall back without
  try {
    localStorage.setItem("mb_bookings", JSON.stringify(bookings));
  } catch {
    try {
      const slim = bookings.map(b => ({
        ...b,
        documents: b.documents.map(d => ({ name: d.name, url: "" })),
        staffProof: b.staffProof.map(d => ({ name: d.name, url: "" })),
      }));
      localStorage.setItem("mb_bookings", JSON.stringify(slim));
    } catch {}
  }
}

// ── Seed (initial) data ───────────────────────────────────────────
const SEED_USERS: User[] = [
  { id: "u1", name: "Admin", email: "admin@mahabharat.com", phone: "9999999999", password: "admin123", role: "admin", isActive: true, createdAt: "2025-01-15T10:00:00Z" },
  { id: "u2", name: "Rajesh Kumar", email: "rajesh@mahabharat.com", phone: "9888888888", password: "staff123", role: "staff", isActive: true, createdAt: "2025-02-01T10:00:00Z" },
  { id: "u3", name: "Priya Sharma", email: "priya@mahabharat.com", phone: "9777777777", password: "staff123", role: "staff", isActive: true, createdAt: "2025-02-10T10:00:00Z" },
  { id: "u4", name: "Amit Patel", email: "amit@example.com", phone: "9666666666", password: "customer123", role: "customer", isActive: true, createdAt: "2025-03-01T10:00:00Z", address: { street: "123 MG Road", city: "Mumbai", state: "Maharashtra", pincode: "400001" } },
];

const SEED_BOOKINGS: Booking[] = [
  { id: "b1", userId: "u4", serviceId: "s1", type: "government", status: "pending", applicantDetails: { fullName: "Amit Patel", fatherName: "Ramesh Patel", dob: "1995-06-15", aadharNumber: "", additionalInfo: "New Aadhar card needed" }, documents: [{ name: "aadhar_proof.pdf", url: "" }], staffProof: [], notes: "Urgent requirement", adminNotes: "", amount: 299, isPaid: true, createdAt: "2025-11-20T10:00:00Z" },
  { id: "b2", userId: "u4", serviceId: "s7", type: "home", status: "assigned", scheduledDate: "2025-12-05", scheduledTime: "10:00 AM", address: { street: "123 MG Road", city: "Mumbai", state: "Maharashtra", pincode: "400001", landmark: "Near SBI Bank" }, assignedStaffId: "u2", documents: [], staffProof: [], notes: "Split AC not cooling", adminNotes: "Assigned to Rajesh", amount: 499, isPaid: false, createdAt: "2025-11-25T10:00:00Z" },
  { id: "b3", userId: "u4", serviceId: "s11", type: "home", status: "completed", scheduledDate: "2025-11-15", scheduledTime: "09:00 AM", address: { street: "123 MG Road", city: "Mumbai", state: "Maharashtra", pincode: "400001", landmark: "Near SBI Bank" }, assignedStaffId: "u3", documents: [], staffProof: [{ name: "cleaning_proof.jpg", url: "" }], notes: "3BHK deep cleaning", adminNotes: "Good job by Priya", amount: 1999, isPaid: true, createdAt: "2025-11-10T10:00:00Z" },
  { id: "b4", userId: "u4", serviceId: "s3", type: "government", status: "verified", applicantDetails: { fullName: "Amit Patel", fatherName: "Ramesh Patel", dob: "1995-06-15", aadharNumber: "123456789012", additionalInfo: "Fresh passport" }, documents: [{ name: "passport_docs.pdf", url: "" }, { name: "photos.jpg", url: "" }], staffProof: [], notes: "", adminNotes: "Documents verified, proceeding to submission", amount: 1999, isPaid: true, createdAt: "2025-11-18T10:00:00Z" },
  { id: "b5", userId: "u4", serviceId: "s9", type: "home", status: "in_progress", scheduledDate: "2025-12-01", scheduledTime: "02:00 PM", address: { street: "123 MG Road", city: "Mumbai", state: "Maharashtra", pincode: "400001", landmark: "Near SBI Bank" }, assignedStaffId: "u2", documents: [], staffProof: [], notes: "MCB tripping issue", adminNotes: "", amount: 299, isPaid: true, createdAt: "2025-11-28T10:00:00Z" },
];

const SEED_PAYMENTS: Payment[] = [
  { id: "p1", bookingId: "b1", userId: "u4", amount: 299, method: "upi", status: "completed", createdAt: "2025-11-20T10:05:00Z" },
  { id: "p2", bookingId: "b3", userId: "u4", amount: 1999, method: "razorpay", status: "completed", createdAt: "2025-11-10T10:10:00Z" },
  { id: "p3", bookingId: "b4", userId: "u4", amount: 1999, method: "cash", status: "completed", createdAt: "2025-11-18T10:15:00Z" },
  { id: "p4", bookingId: "b5", userId: "u4", amount: 299, method: "razorpay", status: "completed", createdAt: "2025-11-28T10:05:00Z" },
];

// ── Live arrays (persisted in localStorage) ───────────────────────
export const users: User[] = load("mb_users", SEED_USERS);
export const bookings: Booking[] = load("mb_bookings", SEED_BOOKINGS);
export const payments: Payment[] = load("mb_payments", SEED_PAYMENTS);

// Services never change at runtime — no need to persist
export const services: Service[] = [
  { id: "s1", name: "Aadhar Card Application", description: "New Aadhar card application and enrollment. We handle the complete process from form filling to submission at the nearest enrollment center.", category: "government", price: 299, requiredDocuments: ["Identity Proof", "Address Proof", "Date of Birth Proof", "Passport Size Photo"], isActive: true, officialUrl: "https://uidai.gov.in/en/my-aadhaar/get-aadhaar.html" },
  { id: "s2", name: "PAN Card Application", description: "Apply for a new PAN card or request corrections/updates to existing PAN card. Quick processing with document verification.", category: "government", price: 499, requiredDocuments: ["Identity Proof", "Address Proof", "Date of Birth Proof", "Passport Size Photo"], isActive: true, officialUrl: "https://www.onlineservices.nsdl.com/" },
  { id: "s3", name: "Passport Application", description: "Fresh passport application or renewal. Complete assistance with form filling, document preparation, and appointment booking.", category: "government", price: 1999, requiredDocuments: ["Aadhar Card", "PAN Card", "Address Proof", "Birth Certificate", "Passport Size Photos"], isActive: true, officialUrl: "https://passportindia.gov.in/" },
  { id: "s4", name: "Driving License", description: "New driving license application, renewal, or duplicate license. We handle RTO documentation and appointment scheduling.", category: "government", price: 799, requiredDocuments: ["Aadhar Card", "Address Proof", "Age Proof", "Medical Certificate", "Passport Size Photos"], isActive: true, officialUrl: "https://sarathi.parivahan.gov.in/" },
  { id: "s5", name: "Income Certificate", description: "Income certificate application for various government schemes and educational purposes.", category: "government", price: 399, requiredDocuments: ["Aadhar Card", "Salary Slip/Income Proof", "Ration Card", "Self Declaration"], isActive: true, officialUrl: "https://aaplesarkar.mahaonline.gov.in/" },
  { id: "s6", name: "Caste Certificate", description: "Apply for caste certificate required for government benefits, education, and employment reservations.", category: "government", price: 399, requiredDocuments: ["Aadhar Card", "School Leaving Certificate", "Father's Caste Certificate", "Ration Card"], isActive: true, officialUrl: "https://aaplesarkar.mahaonline.gov.in/" },
  { id: "s7", name: "AC Repair & Service", description: "Professional AC repair, servicing, and gas refilling. All brands supported with 30-day service warranty.", category: "home", price: 499, requiredDocuments: [], isActive: true },
  { id: "s8", name: "Plumbing Service", description: "Expert plumbing repairs including pipe fitting, leak fixing, tap replacement, and drainage solutions.", category: "home", price: 349, requiredDocuments: [], isActive: true },
  { id: "s9", name: "Electrician Service", description: "Electrical repairs, wiring, switchboard installation, fan/light fitting, and safety inspections.", category: "home", price: 299, requiredDocuments: [], isActive: true },
  { id: "s10", name: "Painting Service", description: "Interior and exterior painting services. Includes wall preparation, primer coating, and premium paint application.", category: "home", price: 2999, requiredDocuments: [], isActive: true },
  { id: "s11", name: "Deep Home Cleaning", description: "Complete deep cleaning of your home including kitchen, bathrooms, bedrooms, and living areas. Professional equipment used.", category: "housekeeping", price: 1999, requiredDocuments: [], isActive: true },
  { id: "s12", name: "Office Cleaning", description: "Professional office cleaning services. Includes desk cleaning, floor mopping, washroom sanitation, and dustbin management.", category: "housekeeping", price: 2499, requiredDocuments: [], isActive: true },
  { id: "s13", name: "Pest Control", description: "Complete pest control treatment for cockroaches, ants, termites, and rodents. Safe chemicals with warranty.", category: "housekeeping", price: 1499, requiredDocuments: [], isActive: true },
  { id: "s14", name: "Security Guard", description: "Trained security personnel for residential complexes, offices, and events. 24/7 availability.", category: "manpower", price: 15000, requiredDocuments: [], isActive: true },
  { id: "s15", name: "Office Boy / Peon", description: "Reliable office assistant for daily office tasks, tea/coffee service, document handling, and errands.", category: "manpower", price: 12000, requiredDocuments: [], isActive: true },
  { id: "s16", name: "Cook / Chef", description: "Experienced cook for household or commercial kitchen. Specializing in Indian cuisine with hygiene certification.", category: "manpower", price: 18000, requiredDocuments: [], isActive: true },
  { id: "s17", name: "Amazon Seller Registration", description: "Complete Amazon seller account setup including GSTIN registration, product listing, and store optimization.", category: "ecommerce", price: 2999, requiredDocuments: ["GSTIN Certificate", "PAN Card", "Bank Statement", "Business Address Proof"], isActive: true, officialUrl: "https://sellercentral.amazon.in/" },
  { id: "s18", name: "Flipkart Seller Registration", description: "End-to-end Flipkart seller onboarding with product cataloging and pricing strategy consultation.", category: "ecommerce", price: 2999, requiredDocuments: ["GSTIN Certificate", "PAN Card", "Bank Statement", "Business Address Proof"], isActive: true, officialUrl: "https://seller.flipkart.com/" },
  { id: "s19", name: "GST Registration", description: "Complete GST registration process for businesses. Includes document preparation and filing with the GST portal.", category: "ecommerce", price: 1999, requiredDocuments: ["PAN Card", "Aadhar Card", "Business Address Proof", "Bank Statement", "Photo"], isActive: true, officialUrl: "https://www.gst.gov.in/home" },
];

// ── ID counter (persisted) ────────────────────────────────────────
export let _id = parseInt(localStorage.getItem("mb_id") || "100", 10);
export const uid = () => {
  _id++;
  try { localStorage.setItem("mb_id", String(_id)); } catch {}
  return String(_id);
};
