// Preview / fill-plan construction. Every discovered field gets exactly one status; only
// "ready" items can be approved by the user, and nothing is filled without that approval.
(function (root) {
  "use strict";
  const MC = root.MCEngine || (root.MCEngine = {});
  if (MC.preview) return;
  const { labelForPath } = MC.core;
  const { protection, isConfirmation, mapField } = MC.classify;
  const { read, format } = MC.values;

  // ready: proposed value, user may approve. Everything else is left to the user.
  const STATUSES = Object.freeze([
    "ready", "missing", "invalid", "low_confidence", "unmapped", "no_matching_option", "ambiguous_option",
    "format_unknown", "too_long", "incompatible", "protected", "identity_manual", "document",
    "unsupported", "locked", "confirmation", "duplicate",
  ]);
  const PUBLIC_KEYS = Object.freeze(["id", "label", "kind", "required", "keyLabel", "confidence", "status", "reason", "display", "hasValue"]);

  function displayLabel(d) {
    const raw = d.label || d.accessibleName || d.placeholder || d.title || d.name || d.domId || "(unlabelled field)";
    return String(raw).replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function planItem(d, { override, forcedProtected, genericFields, fields }) {
    const base = {
      id: d.id, label: displayLabel(d), kind: d.kind, required: !!d.required, key: null, keyLabel: null,
      confidence: 0, status: "unmapped", reason: null, value: null, display: null, candidates: null, hasValue: !!d.hasValue,
    };
    if (forcedProtected) return { ...base, status: "protected", reason: "adapter" };
    const prot = protection(d);
    if (prot) return { ...base, status: prot.status, reason: prot.reason };
    if (d.kind === "unsupported") return { ...base, status: "unsupported" };
    if (d.disabled || d.readOnly) return { ...base, status: "locked" };
    if (isConfirmation(d)) return { ...base, status: "confirmation" };

    let key;
    let confidence;
    if (override) {
      key = override.key;
      confidence = 1;
    } else if (!genericFields) {
      return { ...base, reason: "adapter_only" };
    } else {
      const m = mapField(d);
      if (!m.key) return base;
      key = m.key;
      confidence = m.confidence;
      if (m.reason) return { ...base, key, keyLabel: labelForPath(key), confidence, status: "low_confidence", reason: m.reason };
    }
    const mapped = { ...base, key, keyLabel: labelForPath(key), confidence };
    const leaf = read(fields, key);
    if (leaf.status !== "available") return { ...mapped, status: leaf.status };
    const f = format(d, key, leaf.value, override || {});
    if (f.status !== "ready") return { ...mapped, status: f.status };
    return { ...mapped, status: "ready", value: f.value, display: f.display, candidates: f.candidates || null };
  }

  const asDuplicate = (it) => ({ ...it, status: "duplicate", reason: "same_data_as_another_field", value: null, display: null, candidates: null });

  /**
   * descriptors: from dom.discover(); form: matched adapter form; overrides: { [descriptorId]: { key, dateFormat? } };
   * protectedIds: descriptor ids the adapter marks never-touch; fields: sanitised autofill fields.
   */
  function buildPlan({ descriptors, form, overrides = {}, protectedIds = [], fields }) {
    const prot = new Set(protectedIds);
    const visible = descriptors.filter((d) => d.visible);
    const items = visible.map((d) =>
      planItem(d, { override: overrides[d.id], forcedProtected: prot.has(d.id), genericFields: !!form?.genericFields, fields })
    );
    // One applicant value → one field. Keep the most confident (first on ties); flag the rest.
    const winner = new Map();
    items.forEach((it, i) => {
      if (it.status !== "ready") return;
      const prev = winner.get(it.key);
      if (prev === undefined) winner.set(it.key, i);
      else if (it.confidence > items[prev].confidence) {
        items[prev] = asDuplicate(items[prev]);
        winner.set(it.key, i);
      } else items[i] = asDuplicate(it);
    });
    return { items, summary: summarize(items, descriptors.length - visible.length) };
  }

  function summarize(items, hiddenSkipped) {
    const byStatus = {};
    for (const it of items) byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    return {
      total: items.length,
      ready: byStatus.ready || 0,
      byStatus,
      requiredNotReady: items.filter((it) => it.required && it.status !== "ready").map((it) => it.label).slice(0, 50),
      hiddenSkipped,
    };
  }

  /** What leaves the content script: no raw values or match candidates, only display text. */
  function publicItem(it) {
    const out = {};
    for (const k of PUBLIC_KEYS) out[k] = it[k] ?? null;
    out.required = !!it.required;
    out.hasValue = !!it.hasValue;
    out.confidence = Math.round((it.confidence || 0) * 100) / 100;
    return out;
  }

  MC.preview = Object.freeze({ STATUSES, PUBLIC_KEYS, buildPlan, publicItem, displayLabel });
})(globalThis);
