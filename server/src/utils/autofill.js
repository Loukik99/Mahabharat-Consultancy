/**
 * Read-only autofill payload for one service request.
 *
 * Every output field is explicitly allowlisted and reported as
 *   { status: "available", value, source } | { status: "missing", value: null } | { status: "invalid", value: null }
 * No defaults are invented. Identity values are masked-only. Raw documents,
 * internal notes, comments, storage references and account credentials are never included.
 * Portal-specific "required" rules are out of scope here (later milestone).
 */
const { PROFILE_ENUMS } = require("../models/Profiles");
const {
  containsFullIdentityNumber,
  normalizeMaskedAadhaar,
  normalizeMaskedPan,
} = require("./identity");

const PERSONAL = ["fullName", "fatherName", "motherName", "dob", "gender", "category", "religion", "maritalStatus", "nationality"];
const CONTACT = ["mobile", "email"];
const ADDRESS = ["line", "village", "tehsil", "district", "state", "pincode"];
const EDUCATION = ["board", "rollNumber", "passingYear", "percentage"];
const EDUCATION_LEVELS = ["tenth", "twelfth", "graduation"];
const EXAM = ["examName", "applicationNumber", "rollNumber", "examCentre", "examDate"];
// Request-specific applicant details take precedence over the reusable profile.
const FROM_REQUEST = ["fullName", "fatherName", "dob"];

const isoDate = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const VALIDATORS = {
  dob: isoDate,
  examDate: isoDate,
  pincode: (v) => /^[1-9]\d{5}$/.test(v),
  mobile: (v) => /^[6-9]\d{9}$/.test(v),
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  gender: (v) => PROFILE_ENUMS.gender.includes(v),
  category: (v) => PROFILE_ENUMS.category.includes(v),
  maritalStatus: (v) => PROFILE_ENUMS.maritalStatus.includes(v),
  passingYear: (v) => Number.isInteger(v) && v >= 1950 && v <= new Date().getFullYear() + 1,
  percentage: (v) => typeof v === "number" && v >= 0 && v <= 100,
};
const NUMERIC = new Set(["passingYear", "percentage"]);

function createCollector() {
  const missing = [];
  const invalid = [];

  function field(path, key, raw, source) {
    const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
    if (empty) {
      missing.push(path);
      return { status: "missing", value: null };
    }
    const value = typeof raw === "string" ? raw.trim() : raw;
    const typeOk = NUMERIC.has(key) ? typeof value === "number" : typeof value === "string";
    const valid =
      typeOk &&
      !(typeof value === "string" && containsFullIdentityNumber(value)) &&
      (!VALIDATORS[key] || VALIDATORS[key](value));
    if (!valid) {
      invalid.push(path);
      return { status: "invalid", value: null };
    }
    return { status: "available", value, source };
  }

  function group(prefix, keys, src, source) {
    const out = {};
    for (const k of keys) out[k] = field(`${prefix}.${k}`, k, src?.[k], source);
    return out;
  }

  function identity(path, raw, normalize) {
    if (raw === undefined || raw === null || raw === "") {
      missing.push(path);
      return { status: "missing", value: null };
    }
    const masked = typeof raw === "string" ? normalize(raw) : null;
    if (!masked) {
      invalid.push(path);
      return { status: "invalid", value: null };
    }
    return { status: "available", value: masked, source: "profile" };
  }

  return { field, group, identity, missing, invalid };
}

/**
 * @param {object} r        ServiceRequest document (service populated with name/slug)
 * @param {object|null} p   CustomerProfile of the request owner (lean) or null
 */
function serializeAutofill(r, p) {
  const c = createCollector();
  const profile = p || {};
  const applicant = r.applicantDetails || {};

  const personal = {};
  for (const k of PERSONAL) {
    const fromRequest = FROM_REQUEST.includes(k) && applicant[k];
    personal[k] = fromRequest
      ? c.field(`personal.${k}`, k, applicant[k], "request")
      : c.field(`personal.${k}`, k, profile.personal?.[k], "profile");
  }

  const education = {};
  for (const level of EDUCATION_LEVELS) {
    education[level] = c.group(`education.${level}`, EDUCATION, profile.education?.[level], "profile");
  }

  const examList = Array.isArray(profile.exams) ? profile.exams : [];
  if (!examList.length) c.missing.push("exams");
  const exams = examList.map((e, i) => c.group(`exams[${i}]`, EXAM, e, "profile"));

  const fields = {
    personal,
    contact: c.group("contact", CONTACT, profile.contact, "profile"),
    permanentAddress: c.group("permanentAddress", ADDRESS, profile.permanentAddress, "profile"),
    correspondenceAddress: c.group("correspondenceAddress", ADDRESS, profile.correspondenceAddress, "profile"),
    education,
    exams,
    identity: {
      aadhaarMasked: c.identity("identity.aadhaarMasked", profile.aadhaarRef, normalizeMaskedAadhaar),
      panMasked: c.identity("identity.panMasked", profile.panRef, normalizeMaskedPan),
    },
    requestDetails: {
      referenceNumber: c.field("requestDetails.referenceNumber", "referenceNumber", applicant.referenceNumber, "request"),
    },
  };

  const service = r.service || {};
  return {
    requestId: String(r._id),
    requestNumber: r.requestNumber,
    status: r.status,
    service: {
      id: service._id ? String(service._id) : String(r.service || ""),
      slug: service.slug || null,
      name: service.name || null,
    },
    profileFound: Boolean(p),
    fields,
    missing: c.missing,
    invalid: c.invalid,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { serializeAutofill };
