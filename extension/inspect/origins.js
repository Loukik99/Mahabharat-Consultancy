// Exact origins the inspector may read. Each has exactly one manifest content_scripts match:
// the whole origin, except PMEGP and GST, where only the application page is matched.
// Shared vendor hosts (for example cdn.digialm.com) are deliberately absent.
(function (root) {
  "use strict";
  const MC = root.MCInspect || (root.MCInspect = {});
  if (MC.ALLOWED_ORIGINS) return;
  MC.ALLOWED_ORIGINS = Object.freeze([
    "https://joinindianarmy.nic.in",
    "https://www.joinindianarmy.nic.in",
    "https://gdsrect.indiapost.gov.in",
    "https://www.joinindiannavy.gov.in",
    "https://iafrecruitment.edcil.co.in",
    "https://pmegp.msme.gov.in",
    "https://reg.gst.gov.in",
  ]);
})(globalThis);
