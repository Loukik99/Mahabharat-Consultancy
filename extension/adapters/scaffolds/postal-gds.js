// Disabled adapter scaffold. Not loaded by any manifest and never registered with the engine.
// It holds no field mappings: the registration and application forms have not been captured.
(function (root) {
  "use strict";
  const S = root.MCAdapterScaffolds || (root.MCAdapterScaffolds = {});
  if (S["postal-gds"]) return;
  const freeze = (v) => {
    if (v && typeof v === "object") for (const k of Object.keys(v)) freeze(v[k]);
    return Object.freeze(v);
  };
  S["postal-gds"] = freeze({
    id: "postal-gds",
    portalId: "postal-recruitment",
    name: "India Post GDS online engagement",
    enabled: false,
    verified: false,
    origins: ["https://gdsrect.indiapost.gov.in"],
    forms: [],
    excludedPaths: ["/gdscandidate/forgot-registration"],
    evidence: {
      checkedOn: "2026-10-27",
      publicPages: [
        { url: "https://www.indiapost.gov.in/gdsonlineengagement", role: "official schedule notice, no application fields" },
        { url: "https://gdsrect.indiapost.gov.in/gdscandidate", role: "candidate landing page; says registration is closed" },
        { url: "https://gdsrect.indiapost.gov.in/gdscandidate/forgot-registration", role: "account recovery; excluded from any adapter" },
      ],
    },
    blockers: [
      "Registration for the current schedule is closed, so the registration and application forms are not rendered.",
      "The only public form is account recovery, which must not be adapted.",
    ],
    capturesNeeded: [
      "When a new schedule opens: one inspector capture of the registration form, taken after it finishes loading.",
      "One capture of each page or step of the application form after you sign in yourself.",
      "A second capture of any page where choices reveal more fields, so conditional fields are seen while visible.",
      "Whether dates are typed as text (and in which format) or chosen from a date picker.",
    ],
  });
})(globalThis);
