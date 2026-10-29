const { CustomerProfile } = require("../models");
const { PROFILE_ENUMS } = require("../models/Profiles");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { audit } = require("../utils/helpers");
const {
  containsFullIdentityNumber,
  normalizeMaskedAadhaar,
  normalizeMaskedPan,
} = require("../utils/identity");

const { gender: GENDERS, category: CATEGORIES, maritalStatus: MARITAL_STATUSES } = PROFILE_ENUMS;
const MAX_EXAMS = 5;
const SECTIONS = [
  "personal",
  "contact",
  "permanentAddress",
  "correspondenceAddress",
  "education",
  "exams",
  "aadhaarRef",
  "panRef",
];

// Error messages name the field only — never echo the submitted value.
function bad(field, msg) {
  throw new ApiError(400, `${field} ${msg}`);
}

function text(v, field, max = 100) {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") bad(field, "must be text");
  const s = v.trim();
  if (!s) return undefined;
  if (s.length > max) bad(field, `must be at most ${max} characters`);
  if (containsFullIdentityNumber(s)) bad(field, "must not contain a full Aadhaar or PAN number");
  return s;
}

function oneOf(v, field, allowed) {
  const s = text(v, field, 30);
  if (s === undefined) return undefined;
  const k = s.toLowerCase();
  if (!allowed.includes(k)) bad(field, `must be one of: ${allowed.join(", ")}`);
  return k;
}

function isoDate(v, field, { past = false } = {}) {
  const s = text(v, field, 10);
  if (s === undefined) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    bad(field, "must be a valid date (YYYY-MM-DD)");
  }
  if (past && (d > new Date() || d.getUTCFullYear() < 1900)) bad(field, "must be a past date");
  return s;
}

function matching(v, field, re, msg, max) {
  const s = text(v, field, max);
  if (s === undefined) return undefined;
  if (!re.test(s)) bad(field, msg);
  return s;
}

function num(v, field, min, max, { integer = false } = {}) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    bad(field, `must be ${integer ? "a whole number" : "a number"} between ${min} and ${max}`);
  }
  return integer ? n : Math.round(n * 100) / 100;
}

function obj(v, field) {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) bad(field, "must be an object");
  return v;
}

/** Drop undefined keys; return undefined when nothing is left. */
function compact(o) {
  const out = {};
  for (const [k, val] of Object.entries(o)) if (val !== undefined) out[k] = val;
  return Object.keys(out).length ? out : undefined;
}

function mobile(v, field) {
  const s = text(v, field, 20);
  if (s === undefined) return undefined;
  const digits = s.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) bad(field, "must be a valid 10-digit Indian mobile number");
  return digits;
}

function address(v, field) {
  const a = obj(v, field);
  return compact({
    line: text(a.line, `${field}.line`, 200),
    village: text(a.village, `${field}.village`),
    tehsil: text(a.tehsil, `${field}.tehsil`),
    district: text(a.district, `${field}.district`),
    state: text(a.state, `${field}.state`),
    pincode: matching(a.pincode, `${field}.pincode`, /^[1-9]\d{5}$/, "must be a 6-digit PIN code", 6),
  });
}

function education(v, field) {
  const e = obj(v, field);
  const maxYear = new Date().getFullYear() + 1;
  return compact({
    board: text(e.board, `${field}.board`),
    rollNumber: text(e.rollNumber, `${field}.rollNumber`, 30),
    passingYear: num(e.passingYear, `${field}.passingYear`, 1950, maxYear, { integer: true }),
    percentage: num(e.percentage, `${field}.percentage`, 0, 100),
  });
}

function exams(v) {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) bad("exams", "must be a list");
  if (v.length > MAX_EXAMS) bad("exams", `must have at most ${MAX_EXAMS} entries`);
  const list = v
    .map((x, i) => {
      const e = obj(x, `exams[${i}]`);
      return compact({
        examName: text(e.examName, `exams[${i}].examName`),
        applicationNumber: text(e.applicationNumber, `exams[${i}].applicationNumber`, 40),
        rollNumber: text(e.rollNumber, `exams[${i}].rollNumber`, 30),
        examCentre: text(e.examCentre, `exams[${i}].examCentre`),
        examDate: isoDate(e.examDate, `exams[${i}].examDate`),
      });
    })
    .filter(Boolean);
  return list.length ? list : undefined;
}

function maskedIdentity(v, field, normalize, example) {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") bad(field, "must be text");
  const masked = normalize(v);
  if (masked === null) {
    bad(field, `must contain only the last 4 characters (e.g. ${example}); full numbers are not stored`);
  }
  return masked || undefined;
}

function validateProfile(body) {
  const b = obj(body, "profile");
  const p = obj(b.personal, "personal");
  const c = obj(b.contact, "contact");
  const e = obj(b.education, "education");
  return {
    personal: compact({
      fullName: text(p.fullName, "personal.fullName"),
      fatherName: text(p.fatherName, "personal.fatherName"),
      motherName: text(p.motherName, "personal.motherName"),
      dob: isoDate(p.dob, "personal.dob", { past: true }),
      gender: oneOf(p.gender, "personal.gender", GENDERS),
      category: oneOf(p.category, "personal.category", CATEGORIES),
      religion: text(p.religion, "personal.religion", 50),
      maritalStatus: oneOf(p.maritalStatus, "personal.maritalStatus", MARITAL_STATUSES),
      nationality: text(p.nationality, "personal.nationality", 50),
    }),
    contact: compact({
      mobile: mobile(c.mobile, "contact.mobile"),
      email: matching(c.email, "contact.email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "must be a valid email", 254)?.toLowerCase(),
    }),
    permanentAddress: address(b.permanentAddress, "permanentAddress"),
    correspondenceAddress: address(b.correspondenceAddress, "correspondenceAddress"),
    education: compact({
      tenth: education(e.tenth, "education.tenth"),
      twelfth: education(e.twelfth, "education.twelfth"),
      graduation: education(e.graduation, "education.graduation"),
    }),
    exams: exams(b.exams),
    aadhaarRef: maskedIdentity(b.aadhaarRef, "aadhaarRef", normalizeMaskedAadhaar, "XXXX-XXXX-1234"),
    panRef: maskedIdentity(b.panRef, "panRef", normalizeMaskedPan, "XXXXXX234F"),
  };
}

/** Only the fields the customer UI needs. Identity refs are re-normalized so a
 *  non-masked legacy value could never be returned. */
function serializeProfile(d) {
  const doc = d || {};
  return {
    personal: doc.personal || {},
    contact: doc.contact || {},
    permanentAddress: doc.permanentAddress || {},
    correspondenceAddress: doc.correspondenceAddress || {},
    education: {
      tenth: doc.education?.tenth || {},
      twelfth: doc.education?.twelfth || {},
      graduation: doc.education?.graduation || {},
    },
    exams: doc.exams || [],
    aadhaarRef: normalizeMaskedAadhaar(doc.aadhaarRef) || "",
    panRef: normalizeMaskedPan(doc.panRef) || "",
    updatedAt: doc.updatedAt || null,
  };
}

// GET /api/profile — the caller's own profile (customers only, via route guard).
exports.get = asyncHandler(async (req, res) => {
  const doc = await CustomerProfile.findOne({ user: req.user.id }).lean();
  res.json({ success: true, profile: serializeProfile(doc) });
});

// PUT /api/profile — full replace of the caller's own profile fields (upsert).
exports.update = asyncHandler(async (req, res) => {
  const next = validateProfile(req.body);
  const prev = await CustomerProfile.findOne({ user: req.user.id }).lean();

  const $set = {};
  const $unset = {};
  for (const key of SECTIONS) {
    if (next[key] === undefined) $unset[key] = "";
    else $set[key] = next[key];
  }
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;

  const doc = await CustomerProfile.findOneAndUpdate({ user: req.user.id }, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  }).lean();

  const before = serializeProfile(prev);
  const after = serializeProfile(doc);
  const changed = SECTIONS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  await audit(req.user, "profile_updated", "profile", doc._id, `sections: ${changed.join(", ") || "none"}`);

  res.json({ success: true, profile: after });
});
