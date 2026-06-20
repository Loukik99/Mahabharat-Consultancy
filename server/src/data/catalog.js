// Seed catalog — mirrors the frontend src/data/catalog.ts.
// Prices are placeholders only ("Price on request").
const PRICE = "Price on request";

const categories = [
  { key: "govt_docs", name: "Government Documents", nameHi: "सरकारी दस्तावेज़", description: "Aadhaar, PAN, Voter ID, Passport & certificates", icon: "FileText", accent: "from-blue-500 to-indigo-600", order: 1 },
  { key: "tax_gst", name: "Tax & GST", nameHi: "कर और जीएसटी", description: "GST, ITR filing, e-way bills & billing work", icon: "Receipt", accent: "from-emerald-500 to-teal-600", order: 2 },
  { key: "exams_jobs", name: "Exams & Jobs", nameHi: "परीक्षा और नौकरी", description: "Scholarships, admissions, exam forms, results & jobs", icon: "GraduationCap", accent: "from-orange-500 to-amber-600", order: 3 },
  { key: "documents", name: "Document Services", nameHi: "दस्तावेज़ सेवाएँ", description: "Resume, typing, print, scan, xerox, lamination, photos", icon: "Printer", accent: "from-fuchsia-500 to-purple-600", order: 4 },
  { key: "bills_recharge", name: "Bills & Recharge", nameHi: "बिल और रिचार्ज", description: "Electricity, water bills, mobile, DTH & FASTag recharge", icon: "Zap", accent: "from-rose-500 to-pink-600", order: 5 },
  { key: "business", name: "Business & Registration", nameHi: "व्यवसाय पंजीकरण", description: "Company registration & online seller onboarding", icon: "Building2", accent: "from-cyan-500 to-blue-600", order: 6 },
  { key: "other", name: "Other Services", nameHi: "अन्य सेवाएँ", description: "Any other online work, tell us what you need", icon: "Sparkles", accent: "from-slate-500 to-gray-600", order: 7 },
];

const s = (slug, name, category, description, requiredDocuments, officialLinks, extra = {}) => ({
  slug, name, category, description, requiredDocuments, officialLinks, priceLabel: PRICE, isActive: true, ...extra,
});

const services = [
  s("aadhaar-update", "Aadhaar Update Assistance", "govt_docs", "Help with Aadhaar address, mobile, name or DOB updates and e-Aadhaar download.", ["Aadhaar Number", "Proof for the field being updated", "Registered mobile (for OTP)"], [{ label: "UIDAI Official Site", url: "https://uidai.gov.in/" }], { popular: true, processingTime: "Same day assistance" }),
  s("pan-card", "PAN Card Application", "govt_docs", "New PAN card, corrections and reprints handled end-to-end.", ["Identity Proof", "Address Proof", "Date of Birth Proof", "Passport Size Photo"], [{ label: "Protean (NSDL)", url: "https://www.onlineservices.nsdl.com/paam/endUserRegisterContact.html" }, { label: "UTIITSL", url: "https://www.pan.utiitsl.com/" }], { popular: true, processingTime: "5–15 days (govt)" }),
  s("voter-id", "Voter ID Services", "govt_docs", "New voter registration, corrections, address change and download.", ["Aadhaar Card", "Address Proof", "Passport Size Photo"], [{ label: "Voter Services Portal (ECI)", url: "https://voters.eci.gov.in/" }]),
  s("passport", "Passport Application Assistance", "govt_docs", "Fresh passport or renewal, form filling, document prep and appointment booking.", ["Aadhaar Card", "PAN Card", "Address Proof", "Birth Certificate", "Passport Size Photos"], [{ label: "Passport Seva", url: "https://www.passportindia.gov.in/" }], { popular: true }),
  s("income-certificate", "Income Certificate", "govt_docs", "Income certificate for schemes, scholarships and admissions.", ["Aadhaar Card", "Income Proof", "Ration Card", "Self Declaration"], [{ label: "Service Plus", url: "https://serviceonline.gov.in/" }]),
  s("domicile-certificate", "Domicile Certificate", "govt_docs", "Residence / domicile certificate for education and benefits.", ["Aadhaar Card", "Address Proof", "School Leaving Certificate", "Ration Card"], [{ label: "Service Plus", url: "https://serviceonline.gov.in/" }]),
  s("caste-certificate", "Caste Certificate", "govt_docs", "Caste certificate for reservations in education and employment.", ["Aadhaar Card", "School Leaving Certificate", "Father's Caste Certificate", "Ration Card"], [{ label: "Service Plus", url: "https://serviceonline.gov.in/" }]),
  s("birth-certificate", "Birth Certificate", "govt_docs", "Apply for or correct a birth certificate.", ["Hospital Record / Proof of Birth", "Parents' Aadhaar", "Address Proof"], [{ label: "Civil Registration System", url: "https://crsorgi.gov.in/" }]),
  s("death-certificate", "Death Certificate", "govt_docs", "Apply for a death certificate and certified copies.", ["Proof of Death", "Deceased's ID Proof", "Applicant's ID Proof"], [{ label: "Civil Registration System", url: "https://crsorgi.gov.in/" }]),
  s("driving-license", "Driving Licence", "govt_docs", "Learner / permanent licence, renewal and duplicate, RTO help.", ["Aadhaar Card", "Address Proof", "Age Proof", "Passport Size Photos"], [{ label: "Parivahan Sarathi", url: "https://sarathi.parivahan.gov.in/" }]),

  s("gst-registration", "GST Registration", "tax_gst", "New GSTIN registration with document preparation and filing.", ["PAN Card", "Aadhaar Card", "Business Address Proof", "Bank Statement", "Photo"], [{ label: "GST Portal", url: "https://www.gst.gov.in/" }], { popular: true }),
  s("gst-returns", "GST Return / Forms", "tax_gst", "Monthly / quarterly GST return filing (GSTR-1, GSTR-3B and more).", ["GSTIN", "Sales & Purchase Data", "Previous Returns"], [{ label: "GST Portal", url: "https://www.gst.gov.in/" }]),
  s("itr-filing", "ITR Filing", "tax_gst", "Income tax return filing for salaried, business and professionals.", ["PAN Card", "Aadhaar Card", "Form 16 / Income Details", "Bank Statement"], [{ label: "Income Tax Portal", url: "https://www.incometax.gov.in/" }], { popular: true }),
  s("eway-bill", "E-Way Bills", "tax_gst", "Generate and manage e-way bills for goods transport.", ["GSTIN", "Invoice Details", "Transport Details"], [{ label: "E-Way Bill Portal", url: "https://ewaybillgst.gov.in/" }]),
  s("gst-billing-excel", "GST Billing in Excel", "tax_gst", "GST-compliant invoices and billing sheets prepared in Excel.", ["GSTIN", "Item / Rate List", "Customer Details"], []),
  s("factory-billing", "Factory / Manufacturing Billing", "tax_gst", "Billing, invoicing and record-keeping support for manufacturing units.", ["Business Details", "Item / Rate List", "GSTIN (if any)"], []),

  s("scholarship-forms", "Scholarship Forms", "exams_jobs", "All kinds of scholarship applications, pre-matric, post-matric and merit.", ["Aadhaar Card", "Income Certificate", "Marksheet", "Bank Passbook", "Passport Photo"], [{ label: "National Scholarship Portal", url: "https://scholarships.gov.in/" }], { popular: true }),
  s("admission-forms", "School / College Admission Forms", "exams_jobs", "Online admission form filling for schools, colleges and universities.", ["Marksheet", "Transfer Certificate", "Aadhaar Card", "Passport Photo"], []),
  s("exam-form-filling", "Exam Form Filling", "exams_jobs", "Filling competitive and board exam forms accurately and on time.", ["Aadhaar Card", "Marksheet", "Passport Photo", "Signature"], [], { popular: true }),
  s("army-exam", "Army Exam Forms", "exams_jobs", "Indian Army recruitment / Agniveer application assistance.", ["Aadhaar Card", "Marksheet", "Passport Photo", "Signature"], [{ label: "Join Indian Army", url: "https://joinindianarmy.nic.in/" }]),
  s("navy-exam", "Navy Exam Forms", "exams_jobs", "Indian Navy recruitment / Agniveer application assistance.", ["Aadhaar Card", "Marksheet", "Passport Photo", "Signature"], [{ label: "Join Indian Navy", url: "https://www.joinindiannavy.gov.in/" }]),
  s("airforce-exam", "Air Force Exam Forms", "exams_jobs", "Indian Air Force / Agniveervayu application assistance.", ["Aadhaar Card", "Marksheet", "Passport Photo", "Signature"], [{ label: "Agnipath Vayu (IAF)", url: "https://agnipathvayu.cdac.in/" }]),
  s("govt-job-forms", "Government Job Forms", "exams_jobs", "Application filling for central, state, railway, banking and PSU jobs.", ["Aadhaar Card", "Marksheet", "Passport Photo", "Signature"], [{ label: "Browse Latest Jobs", url: "#/jobs", note: "See our jobs section" }], { popular: true }),
  s("hall-ticket", "Hall Ticket / Admit Card Download", "exams_jobs", "Download and print admit cards / hall tickets for any exam.", ["Registration Number", "Date of Birth / Password"], []),
  s("result-checking", "Exam Result Checking", "exams_jobs", "Check and print exam results from official boards and portals.", ["Roll Number / Registration Number", "Date of Birth"], []),
  s("marksheet-print", "Marksheet Download / Printing", "exams_jobs", "Download and print digital marksheets and certificates.", ["Roll Number", "Board / University Details"], [{ label: "DigiLocker", url: "https://www.digilocker.gov.in/" }]),

  s("resume", "Resume Creation", "documents", "Professional resume / CV designed and printed.", ["Your Details", "Education & Experience", "Passport Photo"], [], { popular: true }),
  s("online-form-filling", "Online Form Filling", "documents", "Filling any online application or registration form for you.", ["Relevant Documents", "Required Details"], []),
  s("document-typing", "Document Typing", "documents", "Typing of letters, applications, affidavits and documents.", ["Content / Draft to Type"], []),
  s("printing", "Printing", "documents", "Black & white and colour printing of any document.", ["File to Print (PDF / Image / Doc)"], [], { priceLabel: "As per pages" }),
  s("scanning", "Scanning", "documents", "High-quality scanning of documents and photos.", ["Documents to Scan"], [], { priceLabel: "As per pages" }),
  s("xerox", "Xerox / Photocopy", "documents", "Photocopy of documents in any quantity.", ["Documents to Copy"], [], { priceLabel: "As per pages" }),
  s("lamination", "Lamination", "documents", "Lamination of certificates, ID cards and documents.", ["Document to Laminate"], [], { priceLabel: "As per size" }),
  s("passport-photos", "Passport Photos", "documents", "Instant passport-size and stamp-size photos in any specification.", [], []),

  s("electricity-bill", "Electricity Bill Payment", "bills_recharge", "Pay your electricity bill quickly and get a receipt.", ["Consumer Number / Bill"], [], { popular: true }),
  s("water-bill", "Water Bill Payment", "bills_recharge", "Pay municipal / water board bills.", ["Consumer Number / Bill"], []),
  s("mobile-recharge", "Mobile Recharge", "bills_recharge", "Prepaid recharge and postpaid bill payment for all operators.", ["Mobile Number", "Plan / Amount"], []),
  s("dth-recharge", "DTH Recharge", "bills_recharge", "DTH / set-top-box recharge for all providers.", ["Subscriber ID", "Plan / Amount"], []),
  s("fastag-recharge", "FASTag Recharge", "bills_recharge", "Recharge your FASTag for any bank or NHAI tag.", ["Vehicle Number / FASTag ID", "Amount"], []),

  s("company-registration", "Company Registration", "business", "Private Limited, LLP and OPC registration with MCA filing support.", ["PAN Card", "Aadhaar Card", "Address Proof", "Photo", "Business Address Proof"], [{ label: "MCA Portal", url: "https://www.mca.gov.in/" }]),
  s("amazon-seller", "Amazon Seller Registration", "business", "Complete Amazon seller setup including listing and store optimisation.", ["GSTIN Certificate", "PAN Card", "Bank Statement", "Business Address Proof"], [{ label: "Amazon Seller Central", url: "https://sellercentral.amazon.in/" }]),
  s("flipkart-seller", "Flipkart Seller Registration", "business", "End-to-end Flipkart seller onboarding and cataloguing.", ["GSTIN Certificate", "PAN Card", "Bank Statement", "Business Address Proof"], [{ label: "Flipkart Seller Hub", url: "https://seller.flipkart.com/" }]),

  s("other-service", "Any Other Online Service", "other", "Don't see your service? Describe what you need and we'll help.", [], []),
];

module.exports = { categories, services, PRICE };
