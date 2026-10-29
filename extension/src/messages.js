import { PROTOCOL_VERSION } from "./config.js";

// Popup ↔ content-script protocol. Messages never carry applicant data or credentials.
export const MSG = Object.freeze({ PING: "MC_PING", PONG: "MC_PONG" });

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function isPlainObject(v) {
  return Object.prototype.toString.call(v) === "[object Object]" && !Array.isArray(v);
}

function hasExactKeys(obj, keys) {
  const actual = Object.keys(obj);
  return actual.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

/** Popup → content script. Only a version-tagged ping is accepted. */
export function isValidPing(msg) {
  return isPlainObject(msg) && hasExactKeys(msg, ["type", "v"]) && msg.type === MSG.PING && msg.v === PROTOCOL_VERSION;
}

/** Content script → popup. */
export function isValidPong(msg) {
  return (
    isPlainObject(msg) &&
    hasExactKeys(msg, ["type", "v", "page", "formFilling"]) &&
    msg.type === MSG.PONG &&
    msg.v === PROTOCOL_VERSION &&
    msg.page === "mahabharat-app" &&
    msg.formFilling === "unavailable"
  );
}

export function createPing() {
  return { type: MSG.PING, v: PROTOCOL_VERSION };
}

export function isValidRequestId(id) {
  return typeof id === "string" && OBJECT_ID_RE.test(id);
}
