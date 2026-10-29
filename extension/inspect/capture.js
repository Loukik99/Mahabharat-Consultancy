// Form-structure capture for the local inspector. Read-only: it never writes to the page,
// focuses, clicks, submits or makes requests.
// Current input values are read only to redact text that repeats them; they are never copied
// into a capture. Typed values, selected options, checked state, file names, cookies, storage,
// headers and query strings are not captured.
(function (root) {
  "use strict";
  const MC = root.MCInspect || (root.MCInspect = {});
  if (MC.captureFormStructure) return;

  const VERSION = 3;
  const MAX_TEXT = 120;
  const MAX_SELECTOR = 240;
  const MAX_PATTERN = 200;
  const MAX_OPTIONS = 300;
  const MAX_FIELDS = 500;
  const MAX_BUTTONS = 60;
  const MAX_FORMS = 30;
  const MAX_FRAME_ORIGINS = 10;
  const MAX_SCAN_ELEMENTS = 20000;
  const FILTERED = Object.freeze(["password", "captcha", "otp", "identity", "payment", "file"]);
  // id, name and form-name come from the page's own identifiers; attribute uses a test or framework
  // hook (data-testid, formcontrolname, aria-label, placeholder…); path is positional and fragile.
  const SELECTOR_KINDS = Object.freeze(["id", "name", "form-name", "attribute", "path"]);
  const ATTRIBUTE_HOOKS = ["data-testid", "data-test", "data-qa", "data-cy", "formcontrolname", "ng-model", "data-ng-model", "aria-label", "placeholder"];
  const BUTTON_TYPES = new Set(["submit", "button", "reset", "image"]);
  const SKIP_TEXT_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "OPTION", "SCRIPT", "STYLE", "BUTTON", "NOSCRIPT", "TEMPLATE"]);
  const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6,[role='heading'],.panel-heading,.card-header,.section-title";
  const OMITTED = Object.freeze([
    "typed values",
    "values of disabled and read-only fields",
    "selected options",
    "checked state",
    "file names",
    "hidden inputs",
    "options of disabled or read-only controls",
    "placeholders and validation of password, CAPTCHA, OTP, identity and payment fields",
    "greetings and account numbers shown on the page",
    "cookies",
    "web storage",
    "request headers",
    "query strings",
    "fragments",
    "token values",
    "frame contents",
    "shadow DOM contents",
  ]);

  function clip(s, max = MAX_TEXT) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max) : t;
  }

  function looksLikeApplicantValue(s) {
    const t = String(s ?? "");
    return (
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(t) ||
      /\b[A-Z]{5}\d{4}[A-Z]\b/i.test(t) ||
      /[^\s@"'[\]]+@[^\s@"'[\]]+\.[^\s@"'[\]]+/.test(t) ||
      /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/.test(t) ||
      /(?:^|[^A-Za-z0-9])\d{0,4}[Xx*•]{3,}(?:[\s-]?[Xx*•]{2,})*[\s-]?\d{2,4}[A-Za-z]?(?![A-Za-z0-9])/.test(t) ||
      /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b/.test(t) ||
      /\d{9,}/.test(t) ||
      /\b(welcome|hello|hi|dear|namaste)\b(?!\s+to\b)[\s,!:]+\S/i.test(t) ||
      /\b(logged|signed) in as\b/i.test(t) ||
      /\b(registration|regn?|application|roll|enrol?ment|candidate|user|login)\.?\s*(no|number|id|code)\b\.?\s*[:-]?\s*[A-Z0-9][A-Z0-9/-]*\d/i.test(t)
    );
  }

  const tokens = (s) =>
    String(s ?? "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_\-.[\]:]+/g, " ")
      .toLowerCase();

  /** Returns one of FILTERED, or null for an ordinary field. */
  function classifySensitivity({ type = "", name = "", id = "", label = "", placeholder = "", aria = "" } = {}) {
    const t = String(type).toLowerCase();
    if (t === "password") return "password";
    if (t === "file") return "file";
    const blob = ` ${tokens(`${name} ${id}`)} ${String(`${label} ${placeholder} ${aria}`).toLowerCase()} `;
    if (/captcha|verification code|security code|text (shown )?in (the )?(below |above )?image|characters? (shown )?in (the )?image/.test(blob)) return "captcha";
    if (/\botp\b|one[\s-]?time[\s-]?(password|pin|code)/.test(blob)) return "otp";
    if (/password|\bpwd\b|passcode/.test(blob)) return "password";
    if (/aadh?aa?r|\buid\b|\bpan\b|permanent account|passport|voter|\bepic\b|driving licen[cs]e|photo ?id|id (proof )?(no|number)|account (no|number)|\bifsc\b/.test(blob)) return "identity";
    if (/card number|\bcvv\b|\bupi\b|net ?banking|payment|\bfee\b.*\b(pay|amount)\b/.test(blob)) return "payment";
    return null;
  }

  const looksGenerated = (s) => /^:r|:r\d|^(mui|mat|react-select|headlessui|radix|ember|ext-gen|rc_select)[-_:]|[0-9a-f]{8}-[0-9a-f]{4}-|\d{5,}/i.test(String(s));

  function cssIdent(s) {
    if (root.CSS?.escape) return root.CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }
  const attr = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  function textOf(node, limit = 200) {
    let out = "";
    const walk = (n) => {
      if (!n || out.length > limit) return;
      if (n.nodeType === 3) {
        out += `${n.nodeValue} `;
        return;
      }
      if (n.nodeType !== 1 || SKIP_TEXT_TAGS.has(n.tagName) || n.hidden) return;
      for (const c of n.childNodes) walk(c);
    };
    walk(node);
    return clip(out, limit);
  }

  function isVisible(el) {
    if (el.hidden) return false;
    const view = el.ownerDocument?.defaultView;
    if (!view?.getComputedStyle || !el.getClientRects) return true;
    if (!el.getClientRects().length) return false;
    const st = view.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.visibility !== "collapse";
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Whole-word match, so a short value such as "GEN" in a hidden input does not blank "Gender".
  function makeRedactor(controls) {
    const typed = new Set();
    for (const el of controls) {
      if (el.tagName === "SELECT") continue;
      const type = String(el.type || "").toLowerCase();
      if (["checkbox", "radio", "file", ...BUTTON_TYPES].includes(type)) continue;
      const v = clip(el.value).toLowerCase();
      if (v.length >= 3 && v.length <= 200) typed.add(v);
    }
    const patterns = [...typed].map((v) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(v)}($|[^\\p{L}\\p{N}])`, "iu"));
    const state = { count: 0 };
    const redact = (s, max = MAX_TEXT) => {
      const t = clip(s, max);
      if (!t) return "";
      if (looksLikeApplicantValue(t) || patterns.some((re) => re.test(t))) {
        state.count += 1;
        return "";
      }
      return t;
    };
    return { redact, state };
  }

  function labelFor(el, doc) {
    const labels = el.labels ? [...el.labels].map((l) => textOf(l)).filter(Boolean) : [];
    if (labels.length) return { text: labels.join(" "), source: "label" };
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => textOf(doc.getElementById(id)))
        .join(" ")
        .trim();
      if (t) return { text: t, source: "aria-labelledby" };
    }
    const aria = clip(el.getAttribute("aria-label"));
    if (aria) return { text: aria, source: "aria-label" };
    const cell = el.closest("td");
    if (cell) {
      const row = cell.parentElement;
      const prev = cell.previousElementSibling;
      if (prev && (prev.tagName === "TH" || prev === row?.cells?.[0]) && !prev.querySelector("input,select,textarea")) {
        const t = textOf(prev);
        if (t) return { text: t, source: "table-cell" };
      }
    }
    const title = clip(el.getAttribute("title"));
    if (title) return { text: title, source: "title" };
    const ph = clip(el.getAttribute("placeholder"));
    if (ph) return { text: ph, source: "placeholder" };
    return { text: "", source: null };
  }

  function groupLabel(el, doc) {
    const group = el.closest("[role='radiogroup'],[role='group']");
    if (group) {
      const by = group.getAttribute("aria-labelledby");
      if (by) {
        const t = by
          .split(/\s+/)
          .map((id) => textOf(doc.getElementById(id)))
          .join(" ")
          .trim();
        if (t) return t;
      }
      const aria = clip(group.getAttribute("aria-label"));
      if (aria) return aria;
    }
    const legend = el.closest("fieldset")?.querySelector(":scope > legend");
    if (legend) return textOf(legend);
    const cell = el.closest("td");
    const first = cell?.parentElement?.cells?.[0];
    if (first && first !== cell && !first.querySelector("input,select,textarea")) return textOf(first);
    return "";
  }

  function requiredOf(el, label) {
    if (el.required) return "attribute";
    if (el.getAttribute("aria-required") === "true") return "aria";
    if (/\*\s*$/.test(label)) return "asterisk";
    return null;
  }

  function countIn(doc, s) {
    try {
      return doc.querySelectorAll(s).length;
    } catch {
      return 0;
    }
  }

  /** Positional selector up to the nearest stable unique id (or body). Always flagged unstable. */
  function pathSelector(el, doc) {
    const parts = [];
    let node = el;
    for (let depth = 0; node?.nodeType === 1 && depth < 30; depth += 1) {
      const tag = node.tagName.toLowerCase();
      if (node !== el && node.id && !looksGenerated(node.id) && countIn(doc, `#${cssIdent(node.id)}`) === 1) {
        parts.unshift(`#${cssIdent(node.id)}`);
        break;
      }
      if (tag === "body") {
        parts.unshift("body");
        break;
      }
      const parent = node.parentElement;
      if (!parent) return null;
      const same = [...parent.children].filter((c) => c.tagName === node.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
      node = parent;
    }
    const s = parts.join(" > ");
    return s.length <= MAX_SELECTOR && countIn(doc, s) === 1 ? s : null;
  }

  function selectorFor(el, doc, { path = true } = {}) {
    const tag = el.tagName.toLowerCase();
    if (el.id) {
      const s = `#${cssIdent(el.id)}`;
      if (countIn(doc, s) === 1) return { selector: s, stable: !looksGenerated(el.id), kind: "id" };
    }
    const name = el.getAttribute("name");
    if (name) {
      const s = `${tag}[name="${attr(name)}"]`;
      if (countIn(doc, s) === 1) return { selector: s, stable: !looksGenerated(name), kind: "name" };
      const form = el.form;
      if (form?.id) {
        const scoped = `form#${cssIdent(form.id)} ${s}`;
        if (countIn(doc, scoped) === 1) return { selector: scoped, stable: !looksGenerated(name) && !looksGenerated(form.id), kind: "form-name" };
      }
    }
    for (const a of ATTRIBUTE_HOOKS) {
      const v = el.getAttribute(a);
      if (!v || v.length > 80 || looksLikeApplicantValue(v)) continue;
      const s = `${tag}[${a}="${attr(v)}"]`;
      if (countIn(doc, s) === 1) return { selector: s, stable: !looksGenerated(v), kind: "attribute" };
    }
    if (path) {
      const s = pathSelector(el, doc);
      if (s) return { selector: s, stable: false, kind: "path" };
    }
    return { selector: null, stable: false, kind: null };
  }

  function frameOrigins(doc) {
    const out = new Set();
    for (const f of doc.querySelectorAll("iframe, frame")) {
      const src = f.getAttribute("src");
      if (f.hasAttribute("srcdoc") || !src || /^\s*(about|javascript|data|blob):/i.test(src)) {
        out.add("inline");
        continue;
      }
      try {
        const u = new URL(src, doc.baseURI);
        out.add(/^https?:$/.test(u.protocol) ? u.origin : "other");
      } catch {
        out.add("other");
      }
    }
    return [...out].slice(0, MAX_FRAME_ORIGINS);
  }

  /** Open shadow roots that contain form controls. Their contents are never read. */
  function shadowRootsWithFields(doc) {
    let n = 0;
    let seen = 0;
    for (const el of doc.querySelectorAll("*")) {
      seen += 1;
      if (seen > MAX_SCAN_ELEMENTS) break;
      if (el.shadowRoot?.querySelector("input, select, textarea")) n += 1;
    }
    return n;
  }

  function actionPath(form, origin, pagePath) {
    const raw = form.getAttribute("action");
    if (!raw || /^\s*javascript:/i.test(raw)) return pagePath;
    try {
      const u = new URL(raw, origin);
      return u.origin === origin ? u.pathname : `${u.origin}${u.pathname}`;
    } catch {
      return pagePath;
    }
  }

  function sectionOf(el, lastHeading) {
    const legend = el.closest("fieldset")?.querySelector(":scope > legend");
    if (legend) {
      const t = textOf(legend);
      if (t) return t;
    }
    const caption = el.closest("table")?.caption;
    if (caption) {
      const t = textOf(caption);
      if (t) return t;
    }
    return lastHeading.get(el) || "";
  }

  function validationOf(el, redact) {
    const v = {};
    const pattern = el.getAttribute("pattern");
    if (pattern) v.pattern = redact(pattern, MAX_PATTERN);
    for (const k of ["min", "max", "step"]) {
      const val = el.getAttribute(k);
      if (val) v[k] = redact(val, 40);
    }
    if (el.maxLength > 0 && el.maxLength < 1000000) v.maxLength = el.maxLength;
    if (el.minLength > 0) v.minLength = el.minLength;
    const mode = el.getAttribute("inputmode");
    if (mode) v.inputMode = clip(mode, 20);
    return Object.keys(v).length ? v : null;
  }

  /**
   * @param {Document} doc
   * @param {{ origin: string, pathname: string }} location origin and path only
   */
  function captureFormStructure(doc, location) {
    const origin = String(location.origin || "");
    const path = String(location.pathname || "/") || "/";
    const controls = [...doc.querySelectorAll("input, select, textarea")];
    const { redact, state } = makeRedactor(controls);

    const lastHeading = new Map();
    let current = "";
    for (const node of doc.querySelectorAll(`${HEADING_SELECTOR}, input, select, textarea`)) {
      if (node.matches(HEADING_SELECTOR)) current = textOf(node);
      else lastHeading.set(node, current);
    }

    const formIndex = new Map();
    const forms = [...doc.forms].slice(0, MAX_FORMS).map((f, index) => {
      formIndex.set(f, index);
      const sel = f.id ? `form#${cssIdent(f.id)}` : f.getAttribute("name") ? `form[name="${attr(f.getAttribute("name"))}"]` : null;
      return {
        index,
        selector: sel ? redact(sel, MAX_SELECTOR) : "",
        id: redact(f.id),
        name: redact(f.getAttribute("name") || ""),
        method: clip(String(f.getAttribute("method") || "get").toLowerCase(), 10),
        actionPath: redact(actionPath(f, origin, path), MAX_SELECTOR),
      };
    });

    const fields = [];
    const buttons = [];
    const radioGroups = new Map();
    let hiddenInputs = 0;
    let beyondLimit = 0;

    for (const el of controls) {
      const tag = el.tagName.toLowerCase();
      const type = tag === "select" ? (el.multiple ? "select-multiple" : "select") : tag === "textarea" ? "textarea" : String(el.type || "text").toLowerCase();
      const form = el.form && formIndex.has(el.form) ? formIndex.get(el.form) : null;

      if (type === "hidden") {
        hiddenInputs += 1;
        continue;
      }
      if (BUTTON_TYPES.has(type)) {
        if (buttons.length < MAX_BUTTONS) {
          const { selector } = selectorFor(el, doc, { path: false });
          buttons.push({ form, type, label: redact(type === "image" ? el.getAttribute("alt") || "" : el.value || ""), selector: selector ? redact(selector, MAX_SELECTOR) : "" });
        }
        continue;
      }
      if (fields.length >= MAX_FIELDS) {
        beyondLimit += 1;
        continue;
      }

      const rawLabel = labelFor(el, doc);
      const labelText = rawLabel.text;
      const requiredSource = requiredOf(el, labelText);
      const label = redact(labelText.replace(/\s*\*\s*$/, ""));
      const section = redact(sectionOf(el, lastHeading));
      const visible = isVisible(el);
      const filtered = classifySensitivity({
        type,
        name: el.getAttribute("name") || "",
        id: el.id || "",
        label: labelText,
        placeholder: el.getAttribute("placeholder") || "",
        aria: el.getAttribute("aria-label") || "",
      });

      if (type === "radio") {
        const key = `${form}|${el.getAttribute("name") || el.id}`;
        let group = radioGroups.get(key);
        if (!group) {
          const gl = groupLabel(el, doc);
          const gsel = el.getAttribute("name") ? `input[type="radio"][name="${attr(el.getAttribute("name"))}"]` : "";
          group = {
            form,
            tag: "input",
            type: "radio-group",
            id: "",
            name: redact(el.getAttribute("name") || ""),
            selector: redact(gsel, MAX_SELECTOR),
            selectorStable: !!gsel && !looksGenerated(el.getAttribute("name") || ""),
            selectorKind: gsel ? "name" : null,
            label: redact((gl || "").replace(/\s*\*\s*$/, "")),
            labelSource: gl ? "group" : null,
            section,
            required: false,
            requiredSource: null,
            visible: false,
            disabled: true,
            readOnly: false,
            filtered,
            choices: [],
          };
          radioGroups.set(key, group);
          fields.push(group);
        }
        const value = el.getAttribute("value") ?? "on";
        const radioName = el.getAttribute("name") || "";
        const own = selectorFor(el, doc, { path: false });
        const byValue = radioName ? `input[type="radio"][name="${attr(radioName)}"][value="${attr(value)}"]` : "";
        const choiceSel = own.selector || (byValue && countIn(doc, byValue) === 1 ? byValue : "");
        const choiceStable = own.selector ? own.stable : !!choiceSel && !looksGenerated(radioName) && !looksGenerated(value);
        group.choices.push({ value: redact(value), label: label, selector: redact(choiceSel, MAX_SELECTOR), selectorStable: choiceStable });
        if (requiredSource && !group.required) {
          group.required = true;
          group.requiredSource = requiredSource;
        }
        group.visible = group.visible || visible;
        group.disabled = group.disabled && !!el.disabled;
        continue;
      }

      const { selector, stable, kind } = selectorFor(el, doc);
      const safeSelector = selector ? redact(selector, MAX_SELECTOR) : "";
      const field = {
        form,
        tag,
        type,
        id: redact(el.id || ""),
        name: redact(el.getAttribute("name") || ""),
        selector: safeSelector,
        selectorStable: !!safeSelector && stable,
        selectorKind: safeSelector ? kind : null,
        label,
        labelSource: rawLabel.source,
        section,
        required: !!requiredSource,
        requiredSource,
        visible,
        disabled: !!el.disabled,
        readOnly: !!el.readOnly,
        filtered,
      };
      if (filtered && filtered !== "file") {
        if (tag === "select" && !el.disabled) field.optionCount = el.options.length;
        fields.push(field);
        continue;
      }
      if (type === "file") {
        field.accept = redact(el.getAttribute("accept") || "");
        field.multiple = !!el.multiple;
        fields.push(field);
        continue;
      }
      field.placeholder = redact(el.getAttribute("placeholder") || "");
      field.autoComplete = clip(el.getAttribute("autocomplete") || "", 40);
      const validation = validationOf(el, redact);
      if (validation) field.validation = validation;
      if (tag === "select") {
        field.optionCount = el.options.length;
        if (el.disabled || el.readOnly) field.optionsOmitted = el.disabled ? "disabled" : "read-only";
        else {
          field.options = [...el.options].slice(0, MAX_OPTIONS).map((o) => ({ value: redact(o.value), text: redact(o.text) }));
          if (el.options.length > MAX_OPTIONS) field.optionsTruncated = true;
        }
      }
      fields.push(field);
    }

    for (const el of doc.querySelectorAll("button")) {
      if (buttons.length >= MAX_BUTTONS) break;
      const type = oneOf(String(el.getAttribute("type") || "submit").toLowerCase(), ["submit", "button", "reset"]) || "submit";
      const { selector } = selectorFor(el, doc, { path: false });
      buttons.push({
        form: el.form && formIndex.has(el.form) ? formIndex.get(el.form) : null,
        type,
        label: redact([...el.childNodes].map((n) => textOf(n)).join(" ")),
        selector: selector ? redact(selector, MAX_SELECTOR) : "",
      });
    }

    const title = redact(doc.title || "");
    const capture = {
      kind: "form-structure",
      version: VERSION,
      capturedOn: new Date().toISOString().slice(0, 10),
      origin,
      path,
      title,
      forms,
      fields,
      buttons,
      frameOrigins: frameOrigins(doc),
      filteredByKind: Object.fromEntries(FILTERED.map((k) => [k, fields.filter((f) => f.filtered === k).length])),
      counts: {
        forms: forms.length,
        fields: fields.length,
        visibleFields: fields.filter((f) => f.visible).length,
        requiredFields: fields.filter((f) => f.required).length,
        filteredFields: fields.filter((f) => f.filtered).length,
        disabledOrReadOnlyFields: fields.filter((f) => f.disabled || f.readOnly).length,
        unstableSelectors: fields.filter((f) => !f.filtered && !f.selectorStable).length,
        hiddenInputsOmitted: hiddenInputs,
        redactedTexts: state.count,
        beyondLimit,
        frames: doc.querySelectorAll("iframe, frame").length,
        shadowRootsWithFields: shadowRootsWithFields(doc),
      },
      omitted: [...OMITTED],
    };
    return sanitizeCapture(capture);
  }

  // ── Export sanitiser: rebuilds a capture from known keys only ───────────
  const str = (v, max = MAX_TEXT) => {
    if (typeof v !== "string") return "";
    const t = clip(v, max);
    return looksLikeApplicantValue(t) ? "" : t;
  };
  const bool = (v) => v === true;
  const int = (v) => (Number.isInteger(v) && v >= 0 && v < 1e7 ? v : null);
  const oneOf = (v, list) => (list.includes(v) ? v : null);
  const LABEL_SOURCES = ["label", "aria-labelledby", "aria-label", "table-cell", "title", "placeholder", "group"];
  const REQUIRED_SOURCES = ["attribute", "aria", "asterisk"];
  const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;
  const COUNT_KEYS = [
    "forms",
    "fields",
    "visibleFields",
    "requiredFields",
    "filteredFields",
    "disabledOrReadOnlyFields",
    "unstableSelectors",
    "hiddenInputsOmitted",
    "redactedTexts",
    "beyondLimit",
    "frames",
    "shadowRootsWithFields",
  ];

  function sanitizeValidation(v) {
    if (!v || typeof v !== "object") return null;
    const out = {};
    if (typeof v.pattern === "string" && str(v.pattern, MAX_PATTERN)) out.pattern = str(v.pattern, MAX_PATTERN);
    for (const k of ["min", "max", "step"]) if (typeof v[k] === "string" && str(v[k], 40)) out[k] = str(v[k], 40);
    for (const k of ["maxLength", "minLength"]) if (int(v[k]) !== null) out[k] = v[k];
    if (typeof v.inputMode === "string" && str(v.inputMode, 20)) out.inputMode = str(v.inputMode, 20);
    return Object.keys(out).length ? out : null;
  }

  function sanitizeField(f) {
    if (!f || typeof f !== "object") return null;
    const filtered = oneOf(f.filtered, FILTERED);
    const out = {
      form: int(f.form),
      tag: oneOf(f.tag, ["input", "select", "textarea"]) || "input",
      type: str(f.type, 30),
      id: str(f.id),
      name: str(f.name),
      selector: str(f.selector, MAX_SELECTOR),
      selectorStable: bool(f.selectorStable),
      selectorKind: null,
      label: str(f.label),
      labelSource: oneOf(f.labelSource, LABEL_SOURCES),
      section: str(f.section),
      required: bool(f.required),
      requiredSource: oneOf(f.requiredSource, REQUIRED_SOURCES),
      visible: bool(f.visible),
      disabled: bool(f.disabled),
      readOnly: bool(f.readOnly),
      filtered,
    };
    if (out.selector) out.selectorKind = oneOf(f.selectorKind, SELECTOR_KINDS);
    else out.selectorStable = false;
    if (out.type === "radio-group") {
      out.choices = (Array.isArray(f.choices) ? f.choices : []).slice(0, MAX_OPTIONS).map((c) => ({
        value: str(c?.value),
        label: str(c?.label),
        selector: str(c?.selector, MAX_SELECTOR),
        selectorStable: bool(c?.selectorStable),
      }));
      return out;
    }
    if (filtered && filtered !== "file") {
      if (out.tag === "select" && int(f.optionCount) !== null) out.optionCount = f.optionCount;
      return out;
    }
    if (filtered === "file") {
      out.accept = str(f.accept);
      out.multiple = bool(f.multiple);
      return out;
    }
    out.placeholder = str(f.placeholder);
    out.autoComplete = str(f.autoComplete, 40);
    const validation = sanitizeValidation(f.validation);
    if (validation) out.validation = validation;
    if (out.tag === "select") {
      out.optionCount = int(f.optionCount) ?? 0;
      if (f.optionsOmitted === "disabled" || f.optionsOmitted === "read-only" || out.disabled || out.readOnly) {
        out.optionsOmitted = f.optionsOmitted === "read-only" ? "read-only" : "disabled";
      } else {
        out.options = (Array.isArray(f.options) ? f.options : []).slice(0, MAX_OPTIONS).map((o) => ({ value: str(o?.value), text: str(o?.text) }));
        if (f.optionsTruncated === true) out.optionsTruncated = true;
      }
    }
    return out;
  }

  function sanitizeCapture(c) {
    if (!c || typeof c !== "object" || c.kind !== "form-structure") return null;
    const counts = c.counts && typeof c.counts === "object" ? c.counts : {};
    return {
      kind: "form-structure",
      version: VERSION,
      capturedOn: /^\d{4}-\d{2}-\d{2}$/.test(c.capturedOn) ? c.capturedOn : "",
      origin: ORIGIN_RE.test(c.origin) ? c.origin : "",
      path: typeof c.path === "string" && c.path.startsWith("/") ? str(c.path.split(/[?#]/)[0], MAX_SELECTOR) || "/" : "/",
      title: str(c.title),
      settled: c.settled === true ? true : c.settled === false ? false : null,
      waitedMs: int(c.waitedMs),
      forms: (Array.isArray(c.forms) ? c.forms : []).slice(0, MAX_FORMS).map((f) => ({
        index: int(f?.index),
        selector: str(f?.selector, MAX_SELECTOR),
        id: str(f?.id),
        name: str(f?.name),
        method: oneOf(f?.method, ["get", "post", "dialog"]) || "get",
        actionPath: str(f?.actionPath, MAX_SELECTOR).split(/[?#]/)[0],
      })),
      fields: (Array.isArray(c.fields) ? c.fields : []).slice(0, MAX_FIELDS).map(sanitizeField).filter(Boolean),
      buttons: (Array.isArray(c.buttons) ? c.buttons : []).slice(0, MAX_BUTTONS).map((b) => ({
        form: int(b?.form),
        type: oneOf(b?.type, [...BUTTON_TYPES]) || "button",
        label: str(b?.label),
        selector: str(b?.selector, MAX_SELECTOR),
      })),
      frameOrigins: (Array.isArray(c.frameOrigins) ? c.frameOrigins : [])
        .filter((o) => o === "inline" || o === "other" || (typeof o === "string" && ORIGIN_RE.test(o)))
        .slice(0, MAX_FRAME_ORIGINS),
      filteredByKind: Object.fromEntries(FILTERED.map((k) => [k, int(c.filteredByKind?.[k]) ?? 0])),
      counts: Object.fromEntries(COUNT_KEYS.map((k) => [k, int(counts[k]) ?? 0])),
      omitted: [...OMITTED],
    };
  }

  const exportJson = (c) => JSON.stringify(sanitizeCapture(c), null, 2);

  // Positional selectors shift when fields are added, so those fields are compared by structure.
  const diffKey = (f) => (f.selector && f.selectorKind !== "path" ? f.selector : `${f.form}|${f.type}|${f.name}|${f.label}|${f.section}`);

  /** Compare two captures field by field. */
  function diffCaptures(prev, next) {
    if (!prev || !next) return null;
    const key = diffKey;
    const sig = (f) => JSON.stringify([f.type, f.label, f.section, f.required, f.visible, f.disabled, f.readOnly, f.filtered, (f.options || []).length, (f.choices || []).length, f.optionCount ?? null]);
    const a = new Map(prev.fields.map((f) => [key(f), f]));
    const b = new Map(next.fields.map((f) => [key(f), f]));
    const name = (f) => f.label || f.name || f.selector || f.type;
    const added = [...b.keys()].filter((k) => !a.has(k)).map((k) => name(b.get(k)));
    const removed = [...a.keys()].filter((k) => !b.has(k)).map((k) => name(a.get(k)));
    const changed = [...b.keys()].filter((k) => a.has(k) && sig(a.get(k)) !== sig(b.get(k))).map((k) => name(b.get(k)));
    return { samePage: prev.origin === next.origin && prev.path === next.path, added, removed, changed };
  }

  /** A diff received from the content script, reduced to labels that pass the sanitiser. */
  function sanitizeDiff(d) {
    if (!d || typeof d !== "object") return null;
    const list = (v) => (Array.isArray(v) ? v : []).slice(0, MAX_FIELDS).map((s) => str(s, MAX_SELECTOR)).filter(Boolean);
    return { samePage: bool(d.samePage), added: list(d.added), removed: list(d.removed), changed: list(d.changed) };
  }

  Object.assign(MC, {
    CAPTURE_VERSION: VERSION,
    FILTERED,
    SELECTOR_KINDS,
    captureFormStructure,
    sanitizeCapture,
    exportJson,
    diffCaptures,
    sanitizeDiff,
    classifySensitivity,
    looksLikeApplicantValue,
  });
})(globalThis);
