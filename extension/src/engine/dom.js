// DOM layer: field discovery (labels, accessible names, sections, required/visibility) and
// approved-only filling. This file never submits forms, never clicks buttons or links, never
// touches file inputs, and never focuses page elements.
(function (root) {
  "use strict";
  const MC = root.MCEngine || (root.MCEngine = {});
  if (MC.dom) return;
  const { normalize } = MC.core;
  const { controlKind, protection } = MC.classify;
  const { isPlaceholderOption, matchOption } = MC.values;

  const CONTROL_SELECTOR =
    "input, select, textarea, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='listbox'], [role='spinbutton']";
  const NATIVE = new Set(["INPUT", "SELECT", "TEXTAREA"]);
  const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);
  const SKIP_TEXT_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "OPTION", "SCRIPT", "STYLE", "BUTTON", "NOSCRIPT", "TEMPLATE"]);
  const MAX_FIELDS = 2000;
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  function textOf(node, limit = 200) {
    let out = "";
    const walk = (n) => {
      if (out.length > limit || !n) return;
      if (n.nodeType === 3) {
        out += `${n.nodeValue} `;
        return;
      }
      if (n.nodeType !== 1 || SKIP_TEXT_TAGS.has(n.tagName) || n.hidden) return;
      for (const c of n.childNodes) walk(c);
    };
    walk(node);
    return clean(out).slice(0, limit);
  }
  const hasStar = (n) => !!n && /\*/.test(n.textContent || "");
  const hasControl = (n) => !!n?.querySelector?.(CONTROL_SELECTOR);

  function ariaLabelledBy(el) {
    const ids = clean(el.getAttribute("aria-labelledby")).split(" ").filter(Boolean);
    return clean(ids.map((id) => textOf(el.ownerDocument.getElementById(id))).join(" "));
  }

  function headerRowOf(table, row) {
    if (table.tHead?.rows[0]) return table.tHead.rows[0];
    return [...table.rows].find((r) => r !== row && r.cells.length > 1 && [...r.cells].every((c) => c.tagName === "TH")) || null;
  }

  /** Table layouts: "label | control" rows, and matrix tables (column header + row header). */
  function tableContext(el) {
    const cell = el.closest("td, th");
    const row = cell?.parentElement;
    const table = cell?.closest("table");
    if (!cell || !row || !table) return null;
    const cells = [...row.cells];
    const idx = cells.indexOf(cell);
    const header = headerRowOf(table, row);
    const colHeader = header && header !== row && header.cells.length === cells.length ? textOf(header.cells[idx]) : "";
    const rowHeader = idx > 0 && !hasControl(cells[0]) ? textOf(cells[0]) : "";
    if (colHeader && rowHeader && cells.length > 2) return { label: colHeader, labelEl: header.cells[idx], section: rowHeader };
    const prev = cells.slice(0, idx).reverse().find((c) => !hasControl(c) && textOf(c));
    return prev ? { label: textOf(prev), labelEl: prev, section: "" } : null;
  }

  function sectionOf(el) {
    const group = el.closest("[role='group'][aria-labelledby], [role='region'][aria-labelledby], section[aria-labelledby]");
    const parts = [];
    const legend = el.closest("fieldset")?.querySelector(":scope > legend");
    if (legend) parts.push(textOf(legend));
    if (group) parts.push(ariaLabelledBy(group));
    const row = el.closest("tr");
    if (row) {
      for (let r = row.previousElementSibling; r; r = r.previousElementSibling) {
        if (r.cells.length === 1 && !hasControl(r)) {
          parts.push(textOf(r));
          break;
        }
      }
      const caption = row.closest("table")?.caption;
      if (caption) parts.push(textOf(caption));
    }
    if (!parts.length) {
      let node = el;
      for (let depth = 0; node && depth < 8 && !parts.length; depth += 1, node = node.parentElement) {
        let sib = node.previousElementSibling;
        for (let steps = 0; sib && steps < 15; steps += 1, sib = sib.previousElementSibling) {
          if (/^H[1-6]$/.test(sib.tagName) || sib.getAttribute("role") === "heading") {
            parts.push(textOf(sib));
            break;
          }
        }
      }
    }
    return clean(parts.join(" ")).slice(0, 200);
  }

  function nearbyText(el) {
    const candidates = [el.previousElementSibling, el.parentElement?.previousElementSibling];
    for (const n of candidates) {
      if (n && !NATIVE.has(n.tagName) && !hasControl(n)) {
        const t = textOf(n, 120);
        if (t) return { label: t, labelEl: n };
      }
    }
    return null;
  }

  function labelInfo(el) {
    const labels = el.labels ? [...el.labels] : [];
    const explicit = labels.map((l) => textOf(l)).filter(Boolean).join(" ");
    const labelled = el.hasAttribute("aria-labelledby") ? ariaLabelledBy(el) : "";
    const aria = clean(el.getAttribute("aria-label"));
    const tc = tableContext(el);
    let label = explicit || labelled || aria;
    let labelEl = labels[0] || null;
    if (!label && tc) ({ label, labelEl } = tc);
    if (!label) {
      const near = nearbyText(el);
      if (near) ({ label, labelEl } = near);
    }
    const section = clean(`${tc?.section || ""} ${sectionOf(el)}`);
    return {
      label: label.slice(0, 200),
      accessibleName: (labelled || aria || explicit || label).slice(0, 200),
      section,
      starred: labels.some(hasStar) || hasStar(labelEl),
    };
  }

  function groupLabel(first) {
    const rg = first.closest("[role='radiogroup']");
    if (rg) {
      const t = clean(rg.getAttribute("aria-label")) || ariaLabelledBy(rg);
      if (t) return { label: t, labelEl: rg };
    }
    const legend = first.closest("fieldset")?.querySelector(":scope > legend");
    if (legend) return { label: textOf(legend), labelEl: legend };
    const tc = tableContext(first);
    if (tc) return tc;
    let c = first.parentElement;
    for (let i = 0; i < 3 && c; i += 1, c = c.parentElement) {
      const p = c.previousElementSibling;
      if (p && !hasControl(p) && textOf(p)) return { label: textOf(p), labelEl: p };
    }
    return { label: "", labelEl: null };
  }

  function choiceLabel(r) {
    const own = (r.labels ? [...r.labels] : []).map((l) => textOf(l)).join(" ") || clean(r.getAttribute("aria-label"));
    if (own) return own.slice(0, 120);
    const next = r.nextSibling;
    return clean(next?.nodeType === 3 ? next.nodeValue : textOf(next, 120)).slice(0, 120);
  }

  function isVisible(el) {
    if (!el.isConnected) return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return el.getClientRects().length > 0;
  }

  const isCaptchaMedia = (n) =>
    [...n.querySelectorAll("img, canvas, iframe")].some((m) =>
      /captcha/i.test([m.id, m.className, m.getAttribute("alt"), m.getAttribute("src"), m.getAttribute("title"), m.getAttribute("name")].join(" "))
    );
  function nearCaptcha(el) {
    for (let n = el.parentElement, i = 0; n && i < 3; n = n.parentElement, i += 1) {
      if (n.querySelectorAll(CONTROL_SELECTOR).length > 2) break;
      if (isCaptchaMedia(n)) return true;
    }
    return false;
  }

  // Includes the length and pattern limits: a value set by script bypasses maxlength, so a limit
  // tightened after the preview must count as a changed field.
  const signatureOf = (d) => [d.kind, d.tag, d.type, d.name, d.domId, normalize(d.label).slice(0, 60), d.choices ? d.choices.length : "", d.maxLength, d.pattern].join("|");

  function baseFacts(el) {
    const tag = el.tagName;
    const native = NATIVE.has(tag);
    return {
      tag: native ? tag.toLowerCase() : "custom",
      type: tag === "INPUT" ? (el.getAttribute("type") || "text").toLowerCase() : null,
      multiple: tag === "SELECT" && el.multiple,
    };
  }

  function common(el, id, facts) {
    return {
      id,
      kind: controlKind(facts),
      tag: facts.tag,
      type: facts.type,
      name: clean(el.getAttribute("name")).slice(0, 80),
      domId: clean(el.id).slice(0, 80),
      autocomplete: clean(el.getAttribute("autocomplete")).slice(0, 60),
      placeholder: clean(el.getAttribute("placeholder")).slice(0, 120),
      title: clean(el.getAttribute("title")).slice(0, 120),
      pattern: clean(el.getAttribute("pattern")).slice(0, 60),
      maxLength: el.maxLength > 0 ? el.maxLength : 0,
    };
  }

  function describe(el, id) {
    const facts = baseFacts(el);
    const li = labelInfo(el);
    const d = {
      ...common(el, id, facts),
      label: li.label,
      accessibleName: li.accessibleName,
      section: li.section,
      required: !!el.required || el.getAttribute("aria-required") === "true" || li.starred,
      disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true",
      readOnly: !!el.readOnly,
      visible: isVisible(el),
      options: facts.tag === "select" ? [...el.options].slice(0, 300).map((o) => ({ value: o.value, text: clean(o.text).slice(0, 120) })) : null,
      choices: null,
      nearCaptcha: nearCaptcha(el),
      hasValue: false,
    };
    if (d.kind === "checkbox") d.hasValue = el.checked;
    else if (facts.tag === "select") d.hasValue = el.selectedIndex >= 0 && !isPlaceholderOption({ value: el.value, text: el.options[el.selectedIndex]?.text || "" });
    else if (facts.tag !== "custom") d.hasValue = String(el.value || "").length > 0;
    d.signature = signatureOf(d);
    return d;
  }

  function describeRadioGroup(els, id) {
    const first = els[0];
    const gl = groupLabel(first);
    const section = sectionOf(first);
    const d = {
      ...common(first, id, baseFacts(first)),
      label: gl.label.slice(0, 200),
      accessibleName: gl.label.slice(0, 200),
      section,
      required: els.some((r) => r.required || r.getAttribute("aria-required") === "true") || hasStar(gl.labelEl),
      disabled: els.every((r) => r.disabled),
      readOnly: false,
      visible: els.some(isVisible),
      options: null,
      choices: els.map((r) => ({ value: r.value, text: choiceLabel(r) })),
      nearCaptcha: false,
      hasValue: els.some((r) => r.checked),
    };
    d.signature = signatureOf(d);
    return d;
  }

  /** → { descriptors, refs: Map(id → { el, els? }) } in document order. */
  function discover(doc) {
    const descriptors = [];
    const refs = new Map();
    const radioGroups = new Map();
    const formIds = new Map();
    let n = 0;
    for (const el of doc.querySelectorAll(CONTROL_SELECTOR)) {
      if (n >= MAX_FIELDS) break;
      const tag = el.tagName;
      if (tag === "INPUT" && SKIP_INPUT_TYPES.has((el.getAttribute("type") || "").toLowerCase())) continue;
      if (!NATIVE.has(tag) && el.querySelector("input, select, textarea")) continue; // ARIA wrapper around a native control
      if (tag === "INPUT" && el.type === "radio" && el.name) {
        if (el.form && !formIds.has(el.form)) formIds.set(el.form, formIds.size + 1);
        const groupKey = `${el.form ? formIds.get(el.form) : 0}:${el.name}`;
        if (radioGroups.has(groupKey)) {
          radioGroups.get(groupKey).els.push(el);
          continue;
        }
        const id = `f${(n += 1)}`;
        const ref = { el, els: [el] };
        radioGroups.set(groupKey, ref);
        refs.set(id, ref);
        descriptors.push({ id, pendingRadio: true });
        continue;
      }
      const id = `f${(n += 1)}`;
      refs.set(id, { el });
      descriptors.push(describe(el, id));
    }
    return { descriptors: descriptors.map((d) => (d.pendingRadio ? describeRadioGroup(refs.get(d.id).els, d.id) : d)), refs };
  }

  function idForElement(refs, target) {
    for (const [id, ref] of refs) if (ref.el === target || ref.els?.includes(target)) return id;
    return null;
  }

  /** Resolve an adapter form's selectors to descriptor ids. Invalid selectors are ignored. */
  function resolveAdapterForm(form, doc, refs) {
    const overrides = {};
    const protectedIds = [];
    const query = (sel, all) => {
      try {
        return all ? [...doc.querySelectorAll(sel)] : [doc.querySelector(sel)].filter(Boolean);
      } catch {
        return [];
      }
    };
    for (const m of form?.fields || []) {
      const id = query(m.selector).map((el) => idForElement(refs, el))[0];
      if (id) overrides[id] = { key: m.key, ...(m.dateFormat ? { dateFormat: m.dateFormat } : {}) };
    }
    for (const sel of form?.protectedSelectors || []) {
      for (const el of query(sel, true)) {
        const id = idForElement(refs, el);
        if (id && !protectedIds.includes(id)) protectedIds.push(id);
      }
    }
    return { overrides, protectedIds };
  }

  /** How many elements a selector matches; -1 for an invalid selector. */
  function matchCount(doc, sel) {
    try {
      return doc.querySelectorAll(sel).length;
    } catch {
      return -1;
    }
  }

  /** Whether a filled plan item still holds its value (the page's own scripts may reset it). Never returns the value. */
  function holds(item, ref) {
    const el = ref?.el;
    if (!el || !el.isConnected) return false;
    if (item.kind === "radio") {
      const on = (ref.els || []).find((r) => r.isConnected && r.checked);
      return !!on && matchOption([{ value: on.value, text: choiceLabel(on) }], item.candidates || []).length === 1;
    }
    if (item.kind === "checkbox") return el.checked === item.value;
    if (item.kind === "select") return el.selectedIndex >= 0 && matchOption([el.options[el.selectedIndex]].map((o) => ({ value: o.value, text: clean(o.text) })), item.candidates || []).length === 1;
    return el.value === item.value;
  }

  function pageInfo(doc, loc) {
    return {
      pathname: loc.pathname,
      title: doc.title,
      hasSelector: (sel) => {
        try {
          return !!doc.querySelector(sel);
        } catch {
          return false;
        }
      },
    };
  }

  // ── Filling (approved items only) ────────────────────────────────
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  }

  function fireValueEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Radio/checkbox activation only — never used on buttons, links or submit controls.
  function activateCheckable(el) {
    if (el.tagName !== "INPUT" || (el.type !== "radio" && el.type !== "checkbox")) throw new Error("not a checkable input");
    el.click();
  }

  async function fillOne(item, ref, signature, settleMs) {
    const done = (status, reason = null) => ({ id: item.id, status, reason });
    if (item.status !== "ready") return done("skipped", "not_approvable");
    const els = ref?.els ? ref.els.filter((e) => e.isConnected) : null;
    if (!ref || !ref.el.isConnected || (els && !els.length)) return done("skipped", "form_changed");
    const current = els ? describeRadioGroup(els, item.id) : describe(ref.el, item.id);
    if (current.signature !== signature) return done("skipped", "form_changed");
    if (protection(current)) return done("skipped", "protected");
    if (current.disabled || current.readOnly) return done("skipped", "locked");
    if (!current.visible) return done("skipped", "hidden");
    try {
      if (item.kind === "select") {
        const hits = matchOption(current.options || [], item.candidates || []);
        if (hits.length !== 1) return done("skipped", "option_unavailable");
        setNativeValue(ref.el, hits[0].value);
        fireValueEvents(ref.el);
        await settle(settleMs);
        return ref.el.value === hits[0].value ? done("filled") : done("failed", "not_applied");
      }
      if (item.kind === "radio") {
        const hits = matchOption(current.choices || [], item.candidates || []);
        const target = hits.length === 1 ? els.find((r) => r.value === hits[0].value) : null;
        if (!target) return done("skipped", "option_unavailable");
        if (!target.checked) activateCheckable(target);
        return target.checked ? done("filled") : done("failed", "not_applied");
      }
      if (item.kind === "checkbox") {
        if (ref.el.checked !== item.value) activateCheckable(ref.el);
        return ref.el.checked === item.value ? done("filled") : done("failed", "not_applied");
      }
      setNativeValue(ref.el, item.value);
      fireValueEvents(ref.el);
      return ref.el.value === item.value ? done("filled") : done("failed", "not_applied");
    } catch {
      return done("failed", "error");
    }
  }

  /** plan: { items, signatures }. Only ids in approvedIds that are "ready" in the plan are touched. */
  async function fill(plan, refs, approvedIds, { settleMs = 300 } = {}) {
    const approved = new Set(approvedIds);
    const results = [];
    for (const item of plan.items) {
      if (approved.has(item.id)) results.push(await fillOne(item, refs.get(item.id), plan.signatures[item.id], settleMs));
    }
    for (const id of approved) if (!plan.items.some((i) => i.id === id)) results.push({ id, status: "skipped", reason: "not_in_preview" });
    const count = (s) => results.filter((r) => r.status === s).length;
    return { results, summary: { filled: count("filled"), skipped: count("skipped"), failed: count("failed") } };
  }

  MC.dom = Object.freeze({ CONTROL_SELECTOR, discover, describe, resolveAdapterForm, pageInfo, fill, textOf, matchCount, holds });
})(globalThis);
