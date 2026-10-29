// Disabled adapter scaffold. Not loaded by any manifest and never registered with the engine.
// The partial adapter built from the public capture is extension/adapters/pmegp-application.js.
(function (root) {
  "use strict";
  const S = root.MCAdapterScaffolds || (root.MCAdapterScaffolds = {});
  if (S["pmegp-application"]) return;
  const freeze = (v) => {
    if (v && typeof v === "object") for (const k of Object.keys(v)) freeze(v[k]);
    return Object.freeze(v);
  };
  S["pmegp-application"] = freeze({
    id: "pmegp-application",
    portalId: "pmegp",
    name: "PMEGP new-unit application",
    enabled: false,
    verified: false,
    origins: ["https://pmegp.msme.gov.in"],
    forms: [],
    evidence: {
      checkedOn: "2026-10-28",
      publicPages: [
        { url: "https://pmegp.msme.gov.in/Home/HomePage", role: "new-unit application form rendered publicly before Aadhaar validation; captured read-only, nothing typed" },
        { url: "https://pmegp.msme.gov.in/Home/PMEGPUserManual", role: "official user manual page" },
      ],
    },
    blockers: [
      "Only the state before Aadhaar validation was captured. Name, date of birth, age and gender stay disabled until the applicant validates Aadhaar with an OTP.",
      "Several labels on the page are attached to the wrong control, so no mapping can rely on label text without a signed-in capture.",
      "Aadhaar, PAN, IFSC and the Aadhaar-linked name and address are identity fields and are never filled.",
      "The adapter maps four fields (communication taluka/block, PIN, primary mobile, email). The extension's content script runs on https://pmegp.msme.gov.in/Home/HomePage* for detection only; the adapter is not loaded and filling stays off until the post-validation capture confirms the four fields and a supervised fill on the real page has been checked.",
    ],
    capturesNeeded: [
      "A capture after you validate Aadhaar yourself, so the enabled state of the application is recorded.",
      "A second capture of the same state after typing into the four mapped fields yourself (taluka/block, PIN, primary mobile, email) and moving to another field, to show whether the page relabels, locks, hides or replaces them.",
      "A capture of the unit address after choosing a state, district and sub-district, so the dependent lists have options.",
      "A capture of the project section after choosing a training option, so the conditional training fields are visible.",
      "An updated capture-set.json listing those states, each marked \"gate\": \"before\" or \"gate\": \"after\".",
    ],
    gate: {
      name: "Aadhaar validation",
      steps: [
        "Only the applicant does this, on their own computer, with their own Aadhaar. Nobody types an Aadhaar number or OTP for them and nobody asks them for those values.",
        "Load extension/inspect unpacked in Chrome or Edge. It reads page structure only; it has no code that types, clicks or submits.",
        "Open https://pmegp.msme.gov.in/Home/HomePage in a normal tab. Enter your Aadhaar number and name and validate them with the OTP yourself.",
        "When the form shows the validated state, open the inspector and capture. If it says the page is not one it may read, stop and write down only the address-bar path, without anything after ? or #.",
        "Save the export as 02-after-aadhaar.json. Typed values, the Aadhaar number, OTPs, cookies and session tokens are not in it, and the popup re-checks the export for personal-looking text before download.",
        "Type into the four mapped fields yourself (communication taluka/block, PIN, primary mobile, email), click into another field, capture again and save it as 03-after-aadhaar-typed.json. It shows whether the page relabels, locks, hides or replaces them.",
        "Saving or submitting the application is your own choice and not part of the capture. The inspector and the extension never click Validate, Save or Submit.",
        "Copy the files to extension/tests/fixtures/adapters/pmegp-application/ and list them in capture-set.json under step new-unit with \"gate\": \"after\".",
        "Run npm run adapter:check -- pmegp-application. It reports, for each of the four mapped fields, whether it is the same field after validation and whether it is still editable, and a verdict. postValidationVerified may be set only on the verdict consistent; the tests enforce this.",
      ],
    },
    trial: {
      limitedTo: ["#ux_communication_taluk_block", "#ux_communication_pin", "#ux_communication_mobileNo", "#ux_communication_emailId"],
      steps: [
        "Start only when npm run adapter:check -- pmegp-application says the supervised trial is eligible: the captures after Aadhaar validation show the four communication fields as the same fields and still editable.",
        "A developer then makes one explicit change: registry status supervised_verification_only, adapterId pmegp-application, postValidationVerified true, and adapters/pmegp-application.js added to the https://pmegp.msme.gov.in/Home/HomePage* content script before src/portal-content.js. The tests refuse it unless the trial is eligible.",
        "Only the applicant runs the trial, on their own computer, signed in to the Mahabharat website with their own account. Nobody asks them for an Aadhaar number, OTP, CAPTCHA or password.",
        "The applicant opens https://pmegp.msme.gov.in/Home/HomePage and validates Aadhaar with the OTP themselves.",
        "In the extension popup they pick their request and check the origin, form, adapter version and the four fields shown, then click Start supervised trial.",
        "They review the proposed values, tick the confirmation and click Fill ticked fields (trial) once, within two minutes. Cancel trial stops it at once.",
        "They watch the page. The extension never clicks Validate, Save or Submit, never requests or enters an OTP, never answers a CAPTCHA and never pays.",
        "They download the verification record (no values, no session data) and save it in extension/tests/fixtures/adapters/pmegp-application/trials/.",
        "Run npm run adapter:check -- pmegp-application. realPageFillVerified may be set only when the latest valid record passed; the tests enforce this. Normal filling stays off: production enablement is a separate decision after the production readiness check and every regression test pass.",
      ],
    },
  });
})(globalThis);
