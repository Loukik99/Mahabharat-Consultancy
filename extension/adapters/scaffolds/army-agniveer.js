// Disabled adapter scaffold. Not loaded by any manifest and never registered with the engine.
// It holds no field mappings: the application form has not been captured.
(function (root) {
  "use strict";
  const S = root.MCAdapterScaffolds || (root.MCAdapterScaffolds = {});
  if (S["army-agniveer"]) return;
  const freeze = (v) => {
    if (v && typeof v === "object") for (const k of Object.keys(v)) freeze(v[k]);
    return Object.freeze(v);
  };
  S["army-agniveer"] = freeze({
    id: "army-agniveer",
    portalId: "army",
    name: "Army Agniveer application",
    enabled: false,
    verified: false,
    origins: ["https://joinindianarmy.nic.in", "https://www.joinindianarmy.nic.in"],
    forms: [],
    evidence: {
      checkedOn: "2026-10-27",
      publicPages: [
        { url: "https://joinindianarmy.nic.in/Authentication.aspx", role: "CAPTCHA gate and admit-card schedule, not the application" },
        { url: "https://cdn.digialm.com/EForms/configuredHtml/1258/2000519/login.html", role: "linked candidate login on a shared vendor host; HTTP 500 to a plain GET, HTTP 403 in headless Chrome" },
      ],
    },
    blockers: [
      "The application form is behind the CAPTCHA gate and candidate sign-in. It has not been captured.",
      "The linked candidate login is on cdn.digialm.com, a shared vendor host. It is not in the inspector allowlist or the registry. If the application is served there, an explicit decision is needed before any capture or adapter.",
    ],
    capturesNeeded: [
      "The exact origin and path of the page that shows the Agniveer application form after you sign in yourself.",
      "One inspector capture of each page or tab of the application form, taken after it finishes loading.",
      "A second capture of any page where choices reveal more fields, so conditional fields are seen while visible.",
      "A capture of each dependent list (for example district after state) after its parent is chosen, so its options are recorded.",
      "A capture-set.json beside the captures that names each application step and page state, one entry per capture file.",
      "Whether dates are typed as text (and in which format) or chosen from a date picker.",
    ],
  });
})(globalThis);
