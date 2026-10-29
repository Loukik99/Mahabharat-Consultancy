// TEST FIXTURE — loaded only by the portal-smoke test build (a temporary copy of the extension
// whose manifest adds this origin). Never referenced by the shipped manifest.
// Describes the locally served mock form in tests/fixtures/mock-portal/register.html.
(function (root) {
  "use strict";
  root.MCEngine.adapters.register({
    id: "mock-portal",
    testOnly: true,
    portal: { id: "mock-portal", name: "Mock Government Portal (local test fixture)", category: "Test" },
    origins: ["http://127.0.0.1:47811"],
    forms: [
      {
        id: "registration",
        name: "Mock candidate registration",
        match: { pathPrefix: "/register", selector: "form#reg", titleIncludes: "Mock Candidate Registration" },
        genericFields: true,
        fields: [{ selector: "#ref_no", key: "requestDetails.referenceNumber" }],
        protectedSelectors: ["#sec_answer"],
      },
    ],
  });
})(globalThis);
