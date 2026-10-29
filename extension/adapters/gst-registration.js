// GST new registration, part A, https://reg.gst.gov.in/registration/.
// Built only from the sanitised public capture in tests/fixtures/adapters/gst-registration/
// (the page before Proceed). Not loaded by any manifest, and the engine refuses to register it
// while the registry entry is not verified_supported.
//
// Only Email Address and Mobile Number have a fixed meaning on this page. genericFields is false.
// State/UT and District are the registration place (choosing a state loads its district list) and
// are not the applicant's address. "I am a" is the taxpayer category. The radio pair switches
// between this form and Temporary Reference Number continuation. PAN and the legal name taken
// from PAN are never filled.
(function (root) {
  "use strict";
  root.MCEngine.adapters.register({
    id: "gst-registration",
    version: "1.0.0",
    portalId: "gst",
    origins: ["https://reg.gst.gov.in"],
    forms: [
      {
        id: "part-a",
        name: "GST new registration, part A",
        match: { pathPrefix: "/registration/", selector: "form[name=\"preg\"]", titleIncludes: "Registration" },
        genericFields: false,
        fields: [
          { selector: "#email", key: "contact.email" },
          { selector: "#mobile", key: "contact.mobile" },
        ],
        protectedSelectors: ["#pan_card", "#bnm"],
      },
    ],
  });
})(globalThis);
