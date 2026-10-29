/**
 * Builds a local, value-free HTML stand-in for a portal page from a sanitised inspector capture,
 * so adapters can be exercised in Chrome and Edge without opening the portal.
 *
 *   import { renderCaptureFixture, compareRoundTrip } from "./capture-fixture.mjs";
 *   const html = renderCaptureFixture(capture);           // serve on 127.0.0.1 only
 *   const problems = compareRoundTrip(capture, recaptured); // recapture of the rendered page
 *
 * Only what a capture records is reproduced: tags, types, ids, names, labels and their source,
 * sections (as fieldset legends, or headings around unlabelled radio groups), required markers, visibility, locked state, validation,
 * option lists, radio choices and the kind of each filtered field. Fields whose only selector is positional (selectorKind "path")
 * are rendered but cannot be matched back, and are reported as skipped. The page has no script,
 * every form posts to /fixture-submit, and nothing from the capture is rendered unescaped.
 */

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const attrs = (map) =>
  [...map]
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join("");

const ATTRIBUTE_SELECTOR = /^([a-z]+)\[([a-z][a-z0-9-]*)="((?:[^"\\]|\\.)*)"\]$/;
const unescapeAttr = (s) => s.replace(/\\(.)/g, "$1");
const ID_SELECTOR = /^#((?:[^\s\\#.[>+~:]|\\.)+)$/;
const CONTAINED = /^#((?:[^\s\\#.[>+~:]|\\.)+) > ([a-z]+):nth-of-type\((\d+)\)$/;
// CSS.escape writes code-point escapes as "\31 " (hex plus one space) and everything else as "\:".
const unescapeCss = (s) => s.replace(/\\([0-9a-f]{1,6} |.)/gi, (_, c) => (c.endsWith(" ") ? String.fromCodePoint(parseInt(c, 16)) : c));

const FILTER_HINTS = { password: "password", captcha: "captcha", otp: "OTP", identity: "ID number", payment: "payment" };
const STRONGER_THAN_PLACEHOLDER = ["label", "aria-labelledby", "aria-label", "table-cell", "title"];

function controlAttributes(f, labelText) {
  const a = new Map();
  if (f.tag === "input") a.set("type", f.type);
  if (f.id) a.set("id", f.id);
  if (f.name) a.set("name", f.name);
  if (f.selectorKind === "attribute") {
    const m = ATTRIBUTE_SELECTOR.exec(f.selector);
    if (m) a.set(m[2], unescapeAttr(m[3]));
  }
  if (f.placeholder) a.set("placeholder", f.placeholder);
  // A filtered capture withholds the placeholder and autocomplete that may have caused the filtering,
  // so the recorded kind is restated as a neutral placeholder. Only where it can neither become the
  // label (a stronger label source exists) nor the selector (the selector is an id or name).
  if (FILTER_HINTS[f.filtered] && ["id", "name"].includes(f.selectorKind) && STRONGER_THAN_PLACEHOLDER.includes(f.labelSource)) a.set("placeholder", FILTER_HINTS[f.filtered]);
  if (f.autoComplete) a.set("autocomplete", f.autoComplete);
  if (f.labelSource === "aria-label") a.set("aria-label", labelText);
  if (f.labelSource === "title") a.set("title", labelText);
  if (f.labelSource === "placeholder") a.set("placeholder", labelText);
  if (f.requiredSource === "attribute") a.set("required", true);
  if (f.requiredSource === "aria") a.set("aria-required", "true");
  if (f.disabled) a.set("disabled", true);
  if (f.readOnly) a.set("readonly", true);
  if (f.type === "select-multiple" || (f.type === "file" && f.multiple)) a.set("multiple", true);
  if (f.type === "file" && f.accept) a.set("accept", f.accept);
  const v = f.validation || {};
  for (const [k, attr] of [["pattern", "pattern"], ["min", "min"], ["max", "max"], ["step", "step"], ["maxLength", "maxlength"], ["minLength", "minlength"], ["inputMode", "inputmode"]]) {
    if (v[k] !== undefined) a.set(attr, String(v[k]));
  }
  return a;
}

function controlHtml(f, a) {
  if (f.tag === "textarea") return `<textarea${attrs(a)}></textarea>`;
  if (f.tag === "select") {
    const listed = (f.options || []).map((o) => `<option value="${esc(o.value)}">${esc(o.text)}</option>`);
    const unlisted = Array.from({ length: Math.max(0, (f.optionCount || 0) - listed.length) }, () => '<option value=""></option>');
    const options = [...listed, ...unlisted];
    return `<select${attrs(a)}>${options.join("")}</select>`;
  }
  return `<input${attrs(a)}>`;
}

function fieldHtml(f, n, duplicateIds) {
  const star = f.requiredSource === "asterisk" ? " *" : "";
  if (f.type === "radio-group") {
    const choices = (f.choices || []).map((c, i) => {
      const a = new Map([["type", "radio"]]);
      const id = ID_SELECTOR.exec(c.selector);
      if (id) a.set("id", unescapeCss(id[1]));
      if (f.name) a.set("name", f.name);
      a.set("value", c.value);
      if (i === 0 && f.requiredSource === "attribute") a.set("required", true);
      if (i === 0 && f.requiredSource === "aria") a.set("aria-required", "true");
      if (f.disabled) a.set("disabled", true);
      return `<label><input${attrs(a)}> ${esc(c.label)}${i === 0 ? star : ""}</label>`;
    });
    return `<div role="radiogroup"${f.label ? ` aria-label="${esc(f.label)}"` : ""}>${choices.join("")}</div>`;
  }
  const labelText = `${f.label}${star}`;
  const a = controlAttributes(f, labelText);
  switch (f.labelSource) {
    case "label":
      if (f.id && !duplicateIds.has(f.id)) return `<label for="${esc(f.id)}">${esc(labelText)}</label>${controlHtml(f, a)}`;
      return `<label>${esc(labelText)} ${controlHtml(f, a)}</label>`;
    case "aria-labelledby":
      a.set("aria-labelledby", `fixture-label-${n}`);
      return `<span id="fixture-label-${n}">${esc(labelText)}</span>${controlHtml(f, a)}`;
    case "table-cell":
      return `<table><tr><th>${esc(labelText)}</th><td>${controlHtml(f, a)}</td></tr></table>`;
    default:
      return controlHtml(f, a);
  }
}

/** HTML for a local stand-in page. Throws if the capture is not a sanitised form-structure capture. */
export function renderCaptureFixture(capture) {
  if (!capture || capture.kind !== "form-structure" || !Array.isArray(capture.fields)) throw new Error("not an inspector capture");
  const idCounts = new Map();
  for (const f of capture.fields) if (f.id) idCounts.set(f.id, (idCounts.get(f.id) || 0) + 1);
  const duplicateIds = new Set([...idCounts].filter(([, n]) => n > 1).map(([id]) => id));

  // Unlabelled controls captured only by position inside an id container ("#box > input:nth-of-type(2)",
  // as in OTP digit boxes) are rendered as consecutive children of that container, so the positional
  // selectors and an adapter's "#box input" protection resolve on the stand-in as on the page.
  const takenIds = new Set([...capture.fields.map((f) => f.id), ...(capture.forms || []).map((f) => f.id)].filter(Boolean));
  const boxOf = (f) => {
    const m = f.selectorKind === "path" && !f.labelSource ? CONTAINED.exec(f.selector) : null;
    if (!m || m[2] !== f.tag) return null;
    const id = unescapeCss(m[1]);
    return takenIds.has(id) ? null : { id, nth: Number(m[3]), visible: f.visible };
  };

  const group = (fields) => {
    const out = [];
    let section = null;
    let open = false;
    let box = null;
    const closeBox = () => {
      if (box) out.push("</div>");
      box = null;
    };
    fields.forEach((f) => {
      if (f.type === "radio-group" && !f.label && f.section) {
        // A legend would become this group's label, so its section comes from a heading instead.
        closeBox();
        if (open) out.push("</fieldset>");
        open = false;
        section = null;
        const html = fieldHtml(f, capture.fields.indexOf(f), duplicateIds);
        out.push(`<h2>${esc(f.section)}</h2>`, f.visible ? `<div>${html}</div>` : `<div hidden>${html}</div>`, "<h2 hidden></h2>");
        return;
      }
      if (f.section !== section) {
        closeBox();
        if (open) out.push("</fieldset>");
        section = f.section;
        open = !!section;
        if (open) out.push(`<fieldset><legend>${esc(section)}</legend>`);
      }
      const html = fieldHtml(f, capture.fields.indexOf(f), duplicateIds);
      const b = boxOf(f);
      if (b && box && b.id === box.id && b.visible === box.visible && b.nth === box.count + 1) {
        box.count += 1;
        out.push(html);
        return;
      }
      closeBox();
      if (b && b.nth === 1) {
        box = { id: b.id, visible: b.visible, count: 1 };
        out.push(`<div id="${esc(b.id)}"${b.visible ? "" : " hidden"}>`, html);
        return;
      }
      out.push(f.visible ? `<div>${html}</div>` : `<div hidden>${html}</div>`);
    });
    closeBox();
    if (open) out.push("</fieldset>");
    return out.join("\n");
  };
  const buttonsFor = (index) =>
    (capture.buttons || [])
      .filter((b) => b.form === index && b.type !== "image")
      .map((b) => {
        const id = ID_SELECTOR.exec(b.selector);
        return `<button type="${esc(b.type)}"${id ? ` id="${esc(unescapeCss(id[1]))}"` : ""}>${esc(b.label)}</button>`;
      })
      .join("\n");

  const forms = (capture.forms || []).map((form) => {
    const a = new Map([
      ["id", form.id || null],
      ["name", form.name || null],
      ["method", form.method],
      ["action", "/fixture-submit"],
    ]);
    return `<form${attrs(a)}>\n${group(capture.fields.filter((f) => f.form === form.index))}\n${buttonsFor(form.index)}\n</form>`;
  });
  const loose = capture.fields.filter((f) => f.form === null);
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${esc(capture.title)}</title>`,
    "</head><body>",
    `<!-- Local stand-in rendered from a sanitised capture of ${esc(capture.origin)}${esc(capture.path)}. No applicant values. -->`,
    ...forms,
    group(loose),
    buttonsFor(null),
    "</body></html>",
  ].join("\n");
}

const COMPARED = ["tag", "type", "label", "labelSource", "section", "required", "requiredSource", "visible", "disabled", "readOnly", "filtered", "selectorStable", "placeholder", "autoComplete", "accept", "multiple", "optionCount", "optionsOmitted"];

/**
 * Differences between a capture and a recapture of its rendered stand-in.
 * @returns {{ compared: number, skipped: string[], problems: string[] }}
 */
export function compareRoundTrip(original, recaptured) {
  const problems = [];
  const skipped = [];
  let compared = 0;
  const bySelector = new Map(recaptured.fields.filter((f) => f.selector).map((f) => [f.selector, f]));
  for (const f of original.fields) {
    if (!f.selector || f.selectorKind === "path") {
      skipped.push(f.label || f.name || f.type);
      continue;
    }
    const g = bySelector.get(f.selector);
    if (!g) {
      problems.push(`${f.selector}: missing from the recapture`);
      continue;
    }
    compared += 1;
    for (const k of COMPARED) if (JSON.stringify(f[k]) !== JSON.stringify(g[k])) problems.push(`${f.selector}: ${k} ${JSON.stringify(f[k])} became ${JSON.stringify(g[k])}`);
    for (const k of ["options", "validation"]) if (JSON.stringify(f[k] ?? null) !== JSON.stringify(g[k] ?? null)) problems.push(`${f.selector}: ${k} differ`);
    const choices = (x) => JSON.stringify((x.choices || []).map((c) => [c.value, c.label, c.selector, c.selectorStable]));
    if (choices(f) !== choices(g)) problems.push(`${f.selector}: radio choices differ`);
  }
  const forms = (c) => JSON.stringify(c.forms.map((x) => [x.selector, x.id, x.name, x.method]));
  if (forms(original) !== forms(recaptured)) problems.push("forms differ");
  if (original.title !== recaptured.title) problems.push("title differs");
  return { compared, skipped, problems };
}
