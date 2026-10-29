// Applicant-value lookup and formatting for a specific control.
// Never invents data: missing/invalid applicant values, unknown date formats, absent or
// ambiguous options and over-long values all produce a non-fillable status.
(function (root) {
  "use strict";
  const MC = root.MCEngine || (root.MCEngine = {});
  if (MC.values) return;
  const { FIELDS, normalize } = MC.core;

  const ENUM_SYNONYMS = {
    "personal.gender": { male: ["male", "m"], female: ["female", "f"], transgender: ["transgender", "third gender"] },
    "personal.category": {
      general: ["general", "gen", "ur", "unreserved", "general ur"],
      ews: ["ews", "economically weaker section", "economically weaker sections", "general ews"],
      obc: ["obc", "other backward class", "other backward classes"],
      sc: ["sc", "scheduled caste"],
      st: ["st", "scheduled tribe"],
    },
    "personal.maritalStatus": {
      unmarried: ["unmarried", "single", "never married"],
      married: ["married"],
      widowed: ["widowed", "widow", "widower"],
      divorced: ["divorced", "divorcee"],
      separated: ["separated"],
    },
  };
  const ADDRESS_PARTS = ["line", "village", "tehsil", "district", "state", "pincode"];

  function leafAt(fields, path) {
    let node = fields;
    for (const part of String(path).split(".")) {
      const m = /^(\w+)\[(\d+)\]$/.exec(part);
      node = m ? node?.[m[1]]?.[Number(m[2])] : node?.[part];
    }
    return node && typeof node === "object" && "status" in node ? node : null;
  }

  /** → { status: "available"|"missing"|"invalid", value } */
  function read(fields, path) {
    if (path === "derived.correspondenceSameAsPermanent") {
      const perm = ADDRESS_PARTS.map((p) => leafAt(fields, `permanentAddress.${p}`));
      const corr = ADDRESS_PARTS.map((p) => leafAt(fields, `correspondenceAddress.${p}`));
      // Both addresses must be complete; an absent correspondence address is not assumed "same".
      if (!perm.every((l) => l?.status === "available") || !corr.every((l) => l?.status === "available")) {
        return { status: "missing", value: null };
      }
      const same = perm.every((l, i) => normalize(l.value) === normalize(corr[i].value));
      return { status: "available", value: same };
    }
    const leaf = leafAt(fields, path);
    if (!leaf) return { status: "missing", value: null };
    if (leaf.status !== "available") return { status: leaf.status === "invalid" ? "invalid" : "missing", value: null };
    return { status: "available", value: leaf.value };
  }

  function detectDateFormat(d) {
    if (d.kind === "date") return "YYYY-MM-DD";
    const hint = [d.placeholder, d.pattern, d.title, d.label].join(" ").toUpperCase();
    const m = /(DD|MM|YYYY)([/.-])(DD|MM|YYYY)\2(DD|MM|YYYY)/.exec(hint);
    if (!m) return null;
    const fmt = `${m[1]}${m[2]}${m[3]}${m[2]}${m[4]}`;
    return MC.adapters.DATE_FORMATS.includes(fmt) ? fmt : null;
  }

  function formatDate(iso, fmt) {
    const [y, mo, da] = String(iso).split("-");
    return fmt.replace("YYYY", y).replace("MM", mo).replace("DD", da);
  }

  function candidatesFor(path, value) {
    const syn = ENUM_SYNONYMS[path]?.[String(value).toLowerCase()];
    return [...new Set([normalize(value), ...(syn || [])].filter(Boolean))];
  }

  const isPlaceholderOption = (o) => o.value === "" || /^(select|choose|please select|\W*$)/i.test(String(o.text).trim());

  function matchOption(options, candidates) {
    const hits = options.filter((o) => !isPlaceholderOption(o) && (candidates.includes(normalize(o.text)) || candidates.includes(normalize(o.value))));
    return hits;
  }

  /**
   * Format an available applicant value for descriptor d.
   * → { status: "ready", value, display, candidates? } | { status: <reason> }
   */
  function format(d, path, value, override = {}) {
    const spec = FIELDS[path];
    if (spec?.format === "boolean") {
      if (d.kind !== "checkbox" || typeof value !== "boolean") return { status: "incompatible" };
      return { status: "ready", value, display: value ? "Tick" : "Leave unticked" };
    }
    if (d.kind === "checkbox") return { status: "incompatible" };

    if (spec?.format === "date") {
      const fmt = override.dateFormat || detectDateFormat(d);
      if (!fmt) return { status: "format_unknown" };
      if (d.kind === "date" && fmt !== "YYYY-MM-DD") return { status: "format_unknown" };
      const v = formatDate(value, fmt);
      return d.maxLength > 0 && v.length > d.maxLength ? { status: "too_long" } : { status: "ready", value: v, display: v };
    }

    if (d.kind === "select" || d.kind === "radio") {
      const candidates = candidatesFor(path, value);
      const hits = matchOption(d.kind === "select" ? d.options || [] : d.choices || [], candidates);
      if (!hits.length) return { status: "no_matching_option" };
      if (hits.length > 1) return { status: "ambiguous_option" };
      return { status: "ready", value: hits[0].value, display: hits[0].text, candidates };
    }

    let v = typeof value === "number" ? String(value) : String(value ?? "");
    if (path === "contact.mobile") v = v.replace(/\D/g, "");
    if (d.kind === "number" && !/^\d+(\.\d+)?$/.test(v)) return { status: "incompatible" };
    if (d.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { status: "incompatible" };
    if (d.maxLength > 0 && v.length > d.maxLength) return { status: "too_long" };
    return { status: "ready", value: v, display: v };
  }

  MC.values = Object.freeze({ read, format, detectDateFormat, candidatesFor, matchOption, isPlaceholderOption });
})(globalThis);
