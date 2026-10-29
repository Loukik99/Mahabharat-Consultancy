// Field classification: control kind, protected (never-touch) categories, and heuristic
// mapping of a field descriptor to an applicant-data path with a confidence score.
// Pure functions over serialisable descriptors produced by dom.js.
(function (root) {
  "use strict";
  const MC = root.MCEngine || (root.MCEngine = {});
  if (MC.classify) return;
  const { FIELDS, ADAPTER_ONLY, CONFIDENCE_THRESHOLD, AMBIGUITY_MARGIN, normalize, tokenize, containsPhrase } = MC.core;

  const NATIVE_KINDS = new Set(["email", "tel", "number", "date", "radio", "checkbox", "file", "password"]);

  /** Raw element facts → kind. Anything not explicitly handled is "unsupported". */
  function controlKind(d) {
    if (d.tag === "textarea") return "textarea";
    if (d.tag === "select") return d.multiple ? "unsupported" : "select";
    if (d.tag !== "input") return "unsupported"; // contenteditable, ARIA widgets, custom elements
    const t = String(d.type || "text").toLowerCase();
    if (t === "text" || t === "search" || t === "") return "text";
    return NATIVE_KINDS.has(t) ? t : "unsupported";
  }

  // ASP.NET / WebForms naming: "ctl00$Main$txtFatherName" → "FatherName".
  const identifier = (s) =>
    tokenize(
      String(s ?? "")
        .split(/[$:]/)
        .pop()
        .replace(/^(txt|ddl|drp|cmb|cbo|chk|rdo|rbl|rb|sel|inp|tb)(?=[A-Z_])/, "")
    );

  function textsOf(d) {
    const label = normalize(d.label);
    const aria = normalize(d.accessibleName);
    return {
      label,
      aria: aria === label ? "" : aria,
      placeholder: normalize(d.placeholder),
      title: normalize(d.title),
      ident: [identifier(d.name), identifier(d.domId)].filter(Boolean),
      autocomplete: normalize(d.autocomplete).replace(/^(section \S+ )?(shipping |billing )?/, ""),
      section: normalize(d.section),
    };
  }
  const allText = (t) => [t.label, t.aria, t.placeholder, t.title, ...t.ident].join(" ");

  const PROTECTED = [
    ["captcha", /captcha|security code|security text|verification code|image code|characters shown|text shown|code shown|enter the code|type the characters/],
    ["otp", /\botp\b|one time password|one time pin/],
    ["password", /\bpassword\b|\bpasscode\b|\bmpin\b|\btpin\b/],
    ["payment", /card number|\bcvv\b|\bcvc\b|card expiry|\bupi\b|\bvpa\b|net banking|\bpayment\b|pay now/],
  ];
  const DECLARATION = /declar|hereby|i agree|agree to|i accept|accept the|terms|undertak|certify|consent|acknowledg|i confirm/;
  const IDENTITY = /\baadhaar\b|\baadhar\b|\buid\b|\buidai\b|\bpan\b|permanent account number|\bvoter\b|\bepic\b|passport no|passport number/;
  const CONFIRMATION = /\bconfirm\b|\bre enter\b|\breenter\b|\bretype\b|\bre type\b|\bverify\b/;

  /** Never-touch categories. Returns { status, reason } or null. */
  function protection(d) {
    const t = textsOf(d);
    const text = allText(t);
    if (d.kind === "password") return { status: "protected", reason: "password" };
    if (d.nearCaptcha) return { status: "protected", reason: "captcha" };
    for (const [reason, re] of PROTECTED) if (re.test(text)) return { status: "protected", reason };
    if ((d.kind === "checkbox" || d.kind === "radio") && (DECLARATION.test(text) || DECLARATION.test(t.section))) {
      return { status: "protected", reason: "declaration" };
    }
    if (IDENTITY.test(text)) return { status: "identity_manual", reason: "identity" };
    if (d.kind === "file") return { status: "document", reason: "document" };
    return null;
  }

  const isConfirmation = (d) => CONFIRMATION.test(allText(textsOf(d)));

  function addressGroupOf(text) {
    const perm = /\bpermanent\b|\bnative\b/.test(text);
    const corr = /\bcorrespondence\b|\bcommunication\b|\bpresent\b|\bcurrent\b|\bmailing\b|\bpostal address\b|\blocal address\b/.test(text);
    if (perm === corr) return null;
    return perm ? "permanentAddress" : "correspondenceAddress";
  }

  function educationLevelOf(text) {
    const twelfth = /\b12th\b|\btwelfth\b|\bintermediate\b|\bhsc\b|\bhigher secondary\b|\bsenior secondary\b|\bclass xii\b|\bclass 12\b|\bpuc\b|\b10 2\b|\bxii\b/.test(text);
    const rest = text.replace(/higher secondary|senior secondary/g, " ");
    const tenth = /\b10th\b|\btenth\b|\bmatric\w*|\bssc\b|\bsslc\b|\bsecondary\b|\bhigh school\b|\bclass x\b|\bclass 10\b/.test(rest);
    const grad = /\bgraduat\w*|\bdegree\b|\bbachelor\w*|\bug\b/.test(text);
    const hits = [tenth && "tenth", twelfth && "twelfth", grad && "graduation"].filter(Boolean);
    return hits.length === 1 ? hits[0] : null;
  }

  function contextFactor(spec, t) {
    if (spec.context === "address") {
      const g = addressGroupOf(t.label) || addressGroupOf(t.section);
      if (!g) return 0.8; // no section context → stays below threshold
      return g === spec.group ? 1 : 0;
    }
    if (spec.context === "education") {
      const level = educationLevelOf(t.label) || educationLevelOf(t.section);
      return level === spec.group ? 1 : 0;
    }
    return 1;
  }

  function phraseScore(text, phrase) {
    if (!text || !phrase) return 0;
    if (text === phrase) return 0.95;
    if (containsPhrase(text, phrase)) return 0.7 + 0.2 * Math.min(1, phrase.length / text.length);
    return 0;
  }

  // "Permanent Address" / "10th Percentage": the context words are scored by contextFactor, so
  // the remainder of the label is matched on its own.
  const CONTEXT_WORDS = {
    address: /\b(permanent|native|correspondence|communication|present|current|mailing|local)\b/g,
    education: /\b(10th|tenth|12th|twelfth|matric\w*|ssc|sslc|hsc|intermediate|graduation|class (x|xii|10|12))\b/g,
  };
  const withoutContext = (text, context) => (CONTEXT_WORDS[context] ? text.replace(CONTEXT_WORDS[context], " ").replace(/\s+/g, " ").trim() : "");

  function scoreKey(spec, t) {
    let best = 0;
    const bare = withoutContext(t.label, spec.context);
    for (const ph of spec.strong) {
      best = Math.max(best, phraseScore(t.label, ph), phraseScore(t.aria, ph), 0.9 * phraseScore(t.placeholder, ph), 0.9 * phraseScore(t.title, ph));
      if (bare && bare !== t.label) best = Math.max(best, phraseScore(bare, ph));
    }
    for (const ph of spec.weak) {
      best = Math.max(best, Math.min(0.7, Math.max(phraseScore(t.label, ph), phraseScore(t.aria, ph), phraseScore(t.placeholder, ph))));
    }
    for (const tk of spec.tokens) {
      for (const id of t.ident) {
        if (id === tk) best = Math.max(best, 0.85);
        else if (containsPhrase(id, tk)) best = Math.max(best, 0.75);
      }
    }
    if (t.autocomplete && spec.autocomplete.includes(t.autocomplete)) best = Math.max(best, 0.92);
    return best;
  }

  /**
   * Heuristic mapping. Returns { key, confidence, ambiguous, reason } — key null when nothing
   * plausible matched. Callers must treat confidence < CONFIDENCE_THRESHOLD or ambiguous as "do not fill".
   */
  function mapField(d) {
    const t = textsOf(d);
    const scored = [];
    for (const spec of Object.values(FIELDS)) {
      if (ADAPTER_ONLY.has(spec.path) || !spec.kinds.includes(d.kind)) continue;
      const s = scoreKey(spec, t) * contextFactor(spec, t);
      if (s > 0) scored.push({ key: spec.path, score: Math.round(s * 100) / 100 });
    }
    scored.sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    if (!best) return { key: null, confidence: 0, ambiguous: false, reason: "no_match" };
    const ambiguous = !!second && best.score - second.score < AMBIGUITY_MARGIN;
    const noAddressContext = FIELDS[best.key].context === "address" && !addressGroupOf(t.label) && !addressGroupOf(t.section);
    let reason = null;
    if (noAddressContext) reason = "no_section_context";
    else if (ambiguous) reason = "ambiguous";
    else if (best.score < CONFIDENCE_THRESHOLD) reason = "low_confidence";
    return { key: best.key, confidence: best.score, ambiguous, reason, alternatives: scored.slice(1, 3).map((s) => s.key) };
  }

  MC.classify = Object.freeze({ controlKind, protection, isConfirmation, mapField, addressGroupOf, educationLevelOf, phraseScore });
})(globalThis);
