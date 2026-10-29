// Universal form engine — shared constants, text helpers and the applicant-field catalog.
// Engine files are plain scripts that attach to globalThis.MCEngine so the same code runs as
// content scripts (classic) and in the popup / Node tests (side-effect imports). No DOM here.
(function (root) {
  "use strict";
  const MC = root.MCEngine || (root.MCEngine = {});
  if (MC.core) return;

  const PROTOCOL_VERSION = 1;
  // Below this a field is never proposed for filling; the user fills it manually.
  const CONFIDENCE_THRESHOLD = 0.8;
  // Two candidate mappings closer than this are treated as ambiguous.
  const AMBIGUITY_MARGIN = 0.08;

  function normalize(text) {
    return String(text ?? "")
      .toLowerCase()
      .replace(/['’`]/g, "")
      .replace(/[^a-z0-9%]+/g, " ")
      .trim();
  }

  // "fatherName" / "father_name" / "txtFather-Name" → "father name"
  function tokenize(identifier) {
    return normalize(String(identifier ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.[\]]+/g, " "));
  }

  function containsPhrase(text, phrase) {
    return !!text && !!phrase && ` ${text} `.includes(` ${phrase} `);
  }

  const TEXT_KINDS = ["text", "textarea", "email", "tel", "number"];

  // Applicant fields the engine may map. Paths match GET /api/requests/:id/autofill.
  // strong: phrases that identify the field on their own; weak: generic words capped below threshold.
  // context: address/education fields must also carry a matching section/label context.
  const FIELDS = {};
  function field(path, label, opts) {
    FIELDS[path] = Object.freeze({
      path,
      label,
      kinds: Object.freeze(opts.kinds || TEXT_KINDS),
      strong: Object.freeze(opts.strong || []),
      weak: Object.freeze(opts.weak || []),
      tokens: Object.freeze(opts.tokens || []),
      autocomplete: Object.freeze(opts.autocomplete || []),
      context: opts.context || null,
      group: opts.group || null,
      format: opts.format || null,
    });
  }

  field("personal.fullName", "Full name", {
    kinds: ["text", "textarea"],
    strong: ["full name", "candidate name", "name of candidate", "name of the candidate", "candidates name", "applicant name", "name of applicant", "name of the applicant", "applicants name", "candidate full name", "applicant full name"],
    weak: ["name"],
    tokens: ["full name", "candidate name", "applicant name"],
    autocomplete: ["name"],
  });
  field("personal.fatherName", "Father's name", {
    kinds: ["text"],
    strong: ["fathers name", "father name", "name of father", "name of the father", "fathers full name"],
    tokens: ["father name", "fathers name", "fname father"],
  });
  field("personal.motherName", "Mother's name", {
    kinds: ["text"],
    strong: ["mothers name", "mother name", "name of mother", "name of the mother", "mothers full name"],
    tokens: ["mother name", "mothers name"],
  });
  field("personal.dob", "Date of birth", {
    kinds: ["text", "date"],
    strong: ["date of birth", "birth date", "dob", "d o b"],
    tokens: ["dob", "date of birth", "birth date", "birthdate"],
    autocomplete: ["bday"],
    format: "date",
  });
  field("personal.gender", "Gender", { kinds: ["select", "radio", "text"], strong: ["gender", "sex"], tokens: ["gender", "sex"], autocomplete: ["sex"], format: "enum" });
  field("personal.category", "Category", {
    kinds: ["select", "radio", "text"],
    strong: ["category", "social category", "caste category", "reservation category", "community"],
    tokens: ["category", "caste category", "social category"],
    format: "enum",
  });
  field("personal.religion", "Religion", { kinds: ["select", "radio", "text"], strong: ["religion"], tokens: ["religion"], format: "enum" });
  field("personal.maritalStatus", "Marital status", { kinds: ["select", "radio", "text"], strong: ["marital status"], tokens: ["marital status"], format: "enum" });
  field("personal.nationality", "Nationality", { kinds: ["select", "radio", "text"], strong: ["nationality"], tokens: ["nationality"], format: "enum" });
  field("contact.mobile", "Mobile number", {
    kinds: ["tel", "text", "number"],
    strong: ["mobile number", "mobile no", "mobile", "mobile phone", "phone number", "contact number", "contact no", "cell number"],
    weak: ["phone", "contact"],
    tokens: ["mobile", "mobile no", "mobile number", "phone number"],
    autocomplete: ["tel", "tel national", "mobile"],
  });
  field("contact.email", "Email", {
    kinds: ["email", "text"],
    strong: ["email", "e mail", "email address", "email id", "e mail id", "e mail address"],
    tokens: ["email", "email id", "mail id"],
    autocomplete: ["email"],
  });

  const ADDRESS_PARTS = {
    line: { label: "address line", strong: ["address", "address line", "address line 1", "house no", "house number", "house no street", "street address", "street"], tokens: ["address", "address line", "addr", "street"], autocomplete: ["address line1", "street address"] },
    village: { label: "village / town", strong: ["village", "town", "village town", "city town village", "locality", "city"], tokens: ["village", "town", "city", "locality"], autocomplete: ["address level3"] },
    tehsil: { label: "tehsil / taluka", strong: ["tehsil", "taluka", "taluk", "block", "mandal", "sub district", "subdistrict"], tokens: ["tehsil", "taluka", "taluk", "block", "mandal"] },
    district: { label: "district", strong: ["district"], tokens: ["district", "dist"], autocomplete: ["address level2"], kinds: ["select", "text"] },
    state: { label: "state", strong: ["state", "state ut", "state union territory"], tokens: ["state"], autocomplete: ["address level1"], kinds: ["select", "text"] },
    pincode: { label: "PIN code", strong: ["pin code", "pincode", "pin", "postal code", "zip code", "zip"], tokens: ["pin", "pincode", "pin code", "postal code", "zip"], autocomplete: ["postal code"], kinds: ["text", "tel", "number"] },
  };
  for (const [group, groupLabel] of [["permanentAddress", "Permanent address"], ["correspondenceAddress", "Correspondence address"]]) {
    for (const [part, spec] of Object.entries(ADDRESS_PARTS)) {
      field(`${group}.${part}`, `${groupLabel} – ${spec.label}`, {
        kinds: spec.kinds || ["text", "textarea"],
        strong: spec.strong,
        tokens: spec.tokens,
        autocomplete: spec.autocomplete,
        context: "address",
        group,
      });
    }
  }

  const EDUCATION_PARTS = {
    board: { label: "board / university", strong: ["board", "board name", "board university", "name of board", "university", "board of education"], tokens: ["board", "university"], kinds: ["text", "select"] },
    rollNumber: { label: "roll number", strong: ["roll number", "roll no", "seat number", "seat no"], tokens: ["roll no", "roll number", "rollno", "seat no"], kinds: ["text", "number"] },
    passingYear: { label: "year of passing", strong: ["year of passing", "passing year", "year of pass", "passing out year"], weak: ["year"], tokens: ["passing year", "year of passing", "pass year", "yop"], kinds: ["text", "number", "select"] },
    percentage: { label: "percentage", strong: ["percentage", "percentage of marks", "marks percentage", "%", "percent", "aggregate percentage"], tokens: ["percentage", "percent", "per"], kinds: ["text", "number"] },
  };
  for (const [level, levelLabel] of [["tenth", "10th"], ["twelfth", "12th"], ["graduation", "Graduation"]]) {
    for (const [part, spec] of Object.entries(EDUCATION_PARTS)) {
      field(`education.${level}.${part}`, `${levelLabel} – ${spec.label}`, {
        kinds: spec.kinds,
        strong: spec.strong,
        weak: spec.weak,
        tokens: spec.tokens,
        context: "education",
        group: level,
      });
    }
  }

  // Adapter-only fields: never matched heuristically (too ambiguous across portals).
  for (const part of ["examName", "applicationNumber", "rollNumber", "examCentre", "examDate"]) {
    field(`exams[0].${part}`, `Exam – ${part.replace(/([A-Z])/g, " $1").toLowerCase()}`, { kinds: part === "examDate" ? ["text", "date"] : TEXT_KINDS, format: part === "examDate" ? "date" : null });
  }
  field("requestDetails.referenceNumber", "Request reference number", {});
  // Derived boolean, only for "correspondence address same as permanent" checkboxes.
  field("derived.correspondenceSameAsPermanent", "Correspondence same as permanent", {
    kinds: ["checkbox"],
    strong: ["same as permanent address", "same as permanent", "correspondence address same as permanent address", "correspondence address is same as permanent address", "present address same as permanent address", "same as above"],
    format: "boolean",
  });
  // Masked identity values exist in the API but are never filled into real forms.
  field("identity.aadhaarMasked", "Aadhaar (masked)", { kinds: [] });
  field("identity.panMasked", "PAN (masked)", { kinds: [] });

  const ADAPTER_ONLY = new Set(["exams[0].examName", "exams[0].applicationNumber", "exams[0].rollNumber", "exams[0].examCentre", "exams[0].examDate", "requestDetails.referenceNumber"]);

  function labelForPath(path) {
    if (FIELDS[path]) return FIELDS[path].label;
    if (path === "exams") return "Exam details";
    const exam = /^exams\[(\d+)\]\.(\w+)$/.exec(path);
    if (exam) return `Exam ${Number(exam[1]) + 1} – ${exam[2].replace(/([A-Z])/g, " $1").toLowerCase()}`;
    return String(path);
  }

  MC.core = Object.freeze({
    PROTOCOL_VERSION,
    CONFIDENCE_THRESHOLD,
    AMBIGUITY_MARGIN,
    TEXT_KINDS: Object.freeze(TEXT_KINDS),
    FIELDS: Object.freeze(FIELDS),
    ADAPTER_ONLY,
    normalize,
    tokenize,
    containsPhrase,
    labelForPath,
  });
})(globalThis);
