// Disabled adapter scaffold. Not loaded by any manifest and never registered with the engine.
// The partial adapter built from the public capture is extension/adapters/gst-registration.js.
(function (root) {
  "use strict";
  const S = root.MCAdapterScaffolds || (root.MCAdapterScaffolds = {});
  if (S["gst-registration"]) return;
  const freeze = (v) => {
    if (v && typeof v === "object") for (const k of Object.keys(v)) freeze(v[k]);
    return Object.freeze(v);
  };
  S["gst-registration"] = freeze({
    id: "gst-registration",
    portalId: "gst",
    name: "GST new registration, part A",
    enabled: false,
    verified: false,
    origins: ["https://reg.gst.gov.in"],
    forms: [],
    evidence: {
      checkedOn: "2026-10-28",
      publicPages: [
        { url: "https://reg.gst.gov.in/registration/", role: "public new-registration part A, captured read-only before Proceed, nothing typed" },
      ],
    },
    blockers: [
      "Only the page before Proceed was captured. Proceed was not clicked, so the following page, including any OTP or CAPTCHA, has not been seen.",
      "PAN and the legal name as printed on PAN are identity fields and are never filled.",
      "State/UT and District are the place of registration. The district list holds only Select until a state is chosen, and choosing a state was not done.",
      "The adapter maps two fields (email and mobile). The extension's content script runs on https://reg.gst.gov.in/registration* for detection only; the adapter is not loaded and filling stays off until the page after Proceed confirms those two fields and a supervised fill on the real page has been checked.",
    ],
    capturesNeeded: [
      "A capture after you choose a State/UT and “I am a” yourself and type your own details, before Proceed, so the district list has its options and the fields that taxpayer type shows or hides are recorded. The district list shows which State/UT you chose; skip this capture if you prefer.",
      "A capture of the page after you click Proceed yourself. Do not include any OTP or CAPTCHA value.",
      "An updated capture-set.json listing those states, each marked \"gate\": \"before\" or \"gate\": \"after\". If that page is not under /registration/, it needs an explicit decision before the match is widened.",
    ],
    gate: {
      name: "Proceed",
      steps: [
        "Only an applicant registering their own business does this, on their own computer, with their own details. Nobody types a PAN, OTP or CAPTCHA for them and nobody asks them for those values.",
        "Load extension/inspect unpacked in Chrome or Edge. It reads page structure only; it has no code that types, clicks or submits.",
        "Open https://reg.gst.gov.in/registration/ in a normal tab. Choose New Registration, “I am a”, State/UT and District, and type the legal name, PAN, email and mobile yourself.",
        "Optional: open the inspector and capture before Proceed. Save the export as 02-part-a-typed.json. Its district list shows which State/UT you chose.",
        "Click Proceed yourself. Solve any CAPTCHA yourself. Wait until the next page has loaded. Do not type the OTPs before the capture.",
        "Open the inspector and capture. If it says the page is not one it may read, stop and write down only the address-bar path, without anything after ? or #. That page needs an explicit decision before any match is widened.",
        "Save the export as 03-after-proceed.json. Typed values, OTPs, cookies and session tokens are not in it, and the popup re-checks the export for personal-looking text before download.",
        "Continue or abandon the registration yourself. The inspector and the extension never enter an OTP, click Validate, Proceed or Submit, or answer a CAPTCHA.",
        "Copy the files to extension/tests/fixtures/adapters/gst-registration/ and list them in capture-set.json. Use step part-a with \"gate\": \"before\" or \"after\" when the page still has form[name=\"preg\"]. Otherwise use a new step such as after-proceed with \"gate\": \"after\"; the part-a form must not match it.",
        "Run npm run adapter:check -- gst-registration. It reports, for #email and #mobile, whether each is the same field after Proceed and whether it is still editable, and a verdict. postValidationVerified may be set only on the verdict consistent; the tests enforce this.",
      ],
    },
    trial: {
      limitedTo: ["#email", "#mobile"],
      steps: [
        "Start only when npm run adapter:check -- gst-registration says the supervised trial is eligible: the capture after Proceed shows #email and #mobile as the same fields and still editable.",
        "A developer then makes one explicit change: registry status supervised_verification_only, adapterId gst-registration, postValidationVerified true, and adapters/gst-registration.js added to the https://reg.gst.gov.in/registration* content script before src/portal-content.js. The tests refuse it unless the trial is eligible.",
        "Only the applicant runs the trial, on their own computer, signed in to the Mahabharat website with their own account. Nobody asks them for a PAN, OTP, CAPTCHA or password.",
        "The applicant opens https://reg.gst.gov.in/registration/ and makes the page choices themselves.",
        "In the extension popup they pick their request and check the origin, form, adapter version and the two fields shown, then click Start supervised trial.",
        "They review the proposed values, tick the confirmation and click Fill ticked fields (trial) once, within two minutes. Cancel trial stops it at once.",
        "They watch the page. The extension never clicks Proceed, Validate or Submit, never requests or enters an OTP, never answers a CAPTCHA and never pays.",
        "They download the verification record (no values, no session data) and save it in extension/tests/fixtures/adapters/gst-registration/trials/.",
        "Run npm run adapter:check -- gst-registration. realPageFillVerified may be set only when the latest valid record passed; the tests enforce this. Normal filling stays off: production enablement is a separate decision after the production readiness check and every regression test pass.",
      ],
    },
  });
})(globalThis);
