/**
 * Aadhaar / PAN handling — masked-only. Full numbers are never stored,
 * returned, or logged. Only the last four characters are kept.
 */

// Verhoeff tables (Aadhaar check digit) — used to avoid flagging arbitrary
// 12-digit roll / application numbers as Aadhaar.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffValid(digits) {
  let c = 0;
  const arr = String(digits).split("").reverse().map(Number);
  for (let i = 0; i < arr.length; i++) c = D[c][P[i % 8][arr[i]]];
  return c === 0;
}

const AADHAAR_RE = /(?<!\d)([2-9]\d{3})[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)/g;
// 4th PAN character is the holder type (P = individual, C = company, …).
const PAN_RE = /(?<![A-Za-z0-9])([A-Za-z]{3}[ABCFGHLJPTabcfghljpt][A-Za-z])(\d{4})([A-Za-z])(?![A-Za-z0-9])/g;

function maskAadhaarLast4(last4) {
  return `XXXX-XXXX-${last4}`;
}
function maskPanLast4(last4) {
  return `XXXXXX${last4.toUpperCase()}`;
}

/** True if the text contains something that looks like a full Aadhaar or PAN. */
function containsFullIdentityNumber(text) {
  if (typeof text !== "string" || !text) return false;
  for (const m of text.matchAll(AADHAAR_RE)) {
    if (verhoeffValid(m[1] + m[2] + m[3])) return true;
  }
  return new RegExp(PAN_RE.source).test(text);
}

/** Replace any full Aadhaar/PAN inside the text with its masked form. */
function redactIdentityNumbers(text) {
  if (typeof text !== "string" || !text) return text;
  return text
    .replace(AADHAAR_RE, (all, a, b, c) => (verhoeffValid(a + b + c) ? maskAadhaarLast4(c) : all))
    .replace(PAN_RE, (_all, _a, digits, last) => maskPanLast4(digits.slice(1) + last));
}

/**
 * Accepts "1234", "XXXX-XXXX-1234", "XXXX XXXX 1234", "XXXXXXXX1234" (X / x / *).
 * Returns the canonical masked form, "" for empty input, or null if invalid.
 */
function normalizeMaskedAadhaar(input) {
  const v = String(input ?? "").trim();
  if (!v) return "";
  const m = /^(?:[Xx*]{4}[\s-]?[Xx*]{4}[\s-]?)?(\d{4})$/.exec(v);
  return m ? maskAadhaarLast4(m[1]) : null;
}

/** Accepts "234F" or "XXXXXX234F" (X / x / *). Canonical form, "" or null. */
function normalizeMaskedPan(input) {
  const v = String(input ?? "").trim();
  if (!v) return "";
  const m = /^(?:[Xx*]{6})?(\d{3}[A-Za-z])$/.exec(v);
  return m ? maskPanLast4(m[1]) : null;
}

module.exports = {
  verhoeffValid,
  containsFullIdentityNumber,
  redactIdentityNumbers,
  normalizeMaskedAadhaar,
  normalizeMaskedPan,
};
