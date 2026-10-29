// Disabled adapter scaffold. Not loaded by any manifest and never registered with the engine.
// It holds no field mappings: the application form has not been captured.
(function (root) {
  "use strict";
  const S = root.MCAdapterScaffolds || (root.MCAdapterScaffolds = {});
  if (S["navy-agniveer"]) return;
  const freeze = (v) => {
    if (v && typeof v === "object") for (const k of Object.keys(v)) freeze(v[k]);
    return Object.freeze(v);
  };
  S["navy-agniveer"] = freeze({
    id: "navy-agniveer",
    portalId: "navy",
    name: "Navy Agniveer application",
    enabled: false,
    verified: false,
    origins: ["https://www.joinindiannavy.gov.in"],
    forms: [],
    evidence: {
      checkedOn: "2026-10-28",
      publicPages: [
        { url: "https://www.joinindiannavy.gov.in/account/register", role: "public AVR (Apprentice) account creation with a photo-ID number and CAPTCHA, not the Agniveer application" },
        { url: "https://www.joinindiannavy.gov.in/account/state", role: "correspondence-state gate with CAPTCHA in front of login" },
        { url: "https://agniveer.navydmpr.in/sailorscycle5/signUp", role: "linked AVR (SSR/MR) signup; HTTP 403 Forbidden on 2026-10-28, as were /login and /avgapp" },
        { url: "https://sailors.navydmpr.in/ssrmedcycle2/signUp", role: "linked SSR (Medical) signup; HTTP 200, rendered by script, edit window closed 09 June 2026" },
      ],
    },
    blockers: [
      "The Agniveer application form has not been seen on any page, and no Navy application window was open on 2026-10-28.",
      "The linked Agniveer signups are on agniveer.navydmpr.in and sailors.navydmpr.in, which are not in the registry or the inspector allowlist. Adding them needs an explicit decision.",
      "The public account-registration page is not the application and is not adapted.",
    ],
    capturesNeeded: [
      "The exact origin and path of the page that shows the Agniveer application form after you sign in yourself.",
      "One inspector capture of each page or tab of the application form, taken after it finishes loading.",
      "A second capture of any page where choices reveal more fields, so conditional fields are seen while visible.",
      "A capture of each dependent list (for example board after board type) after its parent is chosen, so its options are recorded.",
      "A capture-set.json beside the captures that names each application step and page state, one entry per capture file.",
      "Whether dates are typed as text (and in which format) or chosen from a date picker.",
    ],
  });
})(globalThis);
