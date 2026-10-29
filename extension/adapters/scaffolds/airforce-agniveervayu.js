// Disabled adapter scaffold. Not loaded by any manifest and never registered with the engine.
// It holds no field mappings: the application form has not been captured.
(function (root) {
  "use strict";
  const S = root.MCAdapterScaffolds || (root.MCAdapterScaffolds = {});
  if (S["airforce-agniveervayu"]) return;
  const freeze = (v) => {
    if (v && typeof v === "object") for (const k of Object.keys(v)) freeze(v[k]);
    return Object.freeze(v);
  };
  S["airforce-agniveervayu"] = freeze({
    id: "airforce-agniveervayu",
    portalId: "airforce",
    name: "Air Force Agniveervayu application",
    enabled: false,
    verified: false,
    origins: ["https://iafrecruitment.edcil.co.in"],
    forms: [],
    evidence: {
      checkedOn: "2026-10-28",
      publicPages: [
        { url: "https://iafrecruitment.edcil.co.in/agniveervayu/", role: "recruitment front door, no application form" },
        { url: "https://iafrecruitment.edcil.co.in/agniveervayu/guidelines.html", role: "official online-registration guidelines: e-mail, mobile, Domicile/COAFP then State/UT, Aadhaar, online fee, certificate and photo uploads" },
        { url: "https://cdn.digialm.com/EForms/configuredHtml/1258/101256/login.html", role: "applicant login shell for intake 02/2027 on a shared vendor host; HTTP 403 in headless Chrome" },
      ],
    },
    blockers: [
      "The application is behind applicant login. It has not been captured.",
      "Applicant login and, most likely, the application are on cdn.digialm.com, a shared vendor host. It is not in the inspector allowlist or the registry. An explicit decision is needed before any capture or adapter there.",
      "The published guidelines require an Aadhaar number, online fee payment and certificate and photo uploads, all of which stay with the applicant.",
      "The Non-Combatant intake is a paper form and is out of scope.",
    ],
    capturesNeeded: [
      "The exact origin and path of the page that shows the Agniveervayu application form after you sign in yourself.",
      "One inspector capture of each page or tab of the application form, taken after it finishes loading.",
      "A second capture of any page where choices reveal more fields, so conditional fields are seen while visible.",
      "A capture after choosing the Domicile/COAFP category, so the dependent State/UT list has its options.",
      "A capture-set.json beside the captures that names each application step and page state, one entry per capture file.",
      "Whether dates are typed as text (and in which format) or chosen from a date picker.",
    ],
  });
})(globalThis);
