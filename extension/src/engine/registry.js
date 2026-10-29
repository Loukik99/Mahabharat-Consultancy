// Central portal registry. One entry per service category.
// officialUrl is set only when it was verified (see `verification`); never guessed.
// A portal is "verified_supported" only when a registered adapter exists for it and has
// been tested against the real form structure — none have reached that bar yet. None is
// supervised_verification_only either.
// "adapter_pending_verification" means an adapter is written but its `readiness` record is
// unfinished; the engine refuses to register it and filling stays off.
// "supervised_verification_only" means the captures after the applicant's own step confirmed
// the mapped fields; the adapter registers for a supervised trial of exactly the fields in
// `supervisedTrial` and never for normal filling. It is not production verification.
(function (root) {
  "use strict";
  const MC = root.MCEngine || (root.MCEngine = {});
  if (MC.registry) return;

  const STATUS = Object.freeze({
    VERIFIED_SUPPORTED: "verified_supported",
    SUPERVISED: "supervised_verification_only",
    ADAPTER_PENDING: "adapter_pending_verification",
    RESEARCHED: "researched_not_implemented",
    MANUAL: "requires_manual_handling",
    NOT_ACCESSIBLE: "not_accessible",
  });
  const STATUS_LABELS = Object.freeze({
    verified_supported: "Verified and supported",
    supervised_verification_only: "Supervised verification only — normal filling off",
    adapter_pending_verification: "Adapter written — filling off until verified on the live form",
    researched_not_implemented: "Researched — adapter not implemented",
    requires_manual_handling: "Requires manual handling",
    not_accessible: "Not currently accessible for verification",
    test_fixture: "Local test fixture (not a government portal)",
  });

  const CHECKED_ON = "2026-10-27";
  const RECHECKED_ON = "2026-10-28";
  const METHOD = "Unauthenticated read-only GET (no cookies, nothing submitted)";
  const NOT_INJECTED = "No adapter: the extension does not run on this portal.";
  const REGISTRY_ONLY = ["registry metadata validation (extension/tests/engine.test.mjs)"];
  // Checkpoints a written adapter passes on the way to verified_supported, in order.
  const READINESS = Object.freeze(["publicFormInspected", "adapterImplemented", "localFixtureTestsPassed", "postValidationVerified", "realPageFillVerified"]);
  // Checkpoints a supervised trial needs; realPageFillVerified is what the trial itself establishes.
  const TRIAL_READINESS = Object.freeze(READINESS.slice(0, 4));
  const TRIAL_FIELD_KEYS = Object.freeze(["selector", "key", "tag", "type", "maxLength", "label"]);
  const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

  // The fields a supervised trial may fill, with the facts the captures recorded for each. The
  // content script rejects a field whose live facts differ from these.
  const trial = (t) => Object.freeze({ ...t, fields: Object.freeze(t.fields.map((f) => Object.freeze({ ...f }))) });

  const entry = (e) =>
    Object.freeze({
      adapterId: null,
      supportedForms: Object.freeze([]),
      supportedFields: Object.freeze([]),
      origins: Object.freeze([]),
      testCoverage: Object.freeze(REGISTRY_ONLY),
      readiness: null,
      supervisedTrial: null,
      ...e,
      limitations: Object.freeze(e.limitations),
      verification: Object.freeze(e.verification),
    });

  const PORTALS = Object.freeze([
    entry({
      id: "army",
      category: "Army",
      service: "Indian Army recruitment",
      officialUrl: "https://joinindianarmy.nic.in/",
      origins: Object.freeze(["https://joinindianarmy.nic.in", "https://www.joinindianarmy.nic.in"]),
      status: STATUS.RESEARCHED,
      verification: {
        checkedOn: CHECKED_ON,
        method: METHOD,
        result:
          "HTTP 200. Both https://joinindianarmy.nic.in/ and https://www.joinindianarmy.nic.in/ land on /Authentication.aspx (title “Join Indian Army”). That page is a CAPTCHA gate (form#form1, hidden __EVENTTARGET, __EVENTARGUMENT, __VIEWSTATE, __VIEWSTATEGENERATOR, imgRefresh, txtCaptchaCode, btnSubmit) plus the CEE 2026 admit-card schedule. /Registration.aspx and /Home.aspx return 302 to /error.aspx. The linked candidate login at https://cdn.digialm.com/EForms/configuredHtml/1258/2000519/login.html returned HTTP 500 to a plain GET and HTTP 403 in headless Chrome. The application form was not in the public DOM. Headless Chrome confirmed the same CAPTCHA gate.",
      },
      limitations: [
        "Agniveer application fields are behind the CAPTCHA gate and candidate sign-in. They were not inspected, so no adapter is registered.",
        "cdn.digialm.com is a shared vendor host and is not an extension origin.",
        "A separate local inspector (extension/inspect) can record form structure after you sign in yourself. It does not read what you typed.",
        NOT_INJECTED,
      ],
    }),
    entry({
      id: "navy",
      category: "Navy",
      service: "Indian Navy recruitment",
      officialUrl: "https://www.joinindiannavy.gov.in/",
      origins: Object.freeze(["https://www.joinindiannavy.gov.in"]),
      status: STATUS.RESEARCHED,
      verification: {
        checkedOn: RECHECKED_ON,
        method: METHOD,
        result:
          "2026-10-27: Homepage HTTP 200, title “Join Indian Navy | Government of India”, search form only. Public /account/register (form#register) is account creation, linked from the homepage as “AVR (Apprentice)”: select#photo_id_option (Voter ID, Driving License, PAN Card, 10th/12th Passing Certificate, Passport), select#board_type (10th Board, 12th Board), select#board (only “Please Select” until a board type is chosen), #board_name maxlength 100, #photo_id_value maxlength 20, #captcha maxlength 6. /account/login redirects to /account/state (form#state_form, select#state, #captcha). 2026-10-28: the homepage links AVR (SSR/MR) to https://agniveer.navydmpr.in/sailorscycle5/signUp and /login, and SSR (Medical) to https://sailors.navydmpr.in/ssrmedcycle2/signUp and /login. agniveer.navydmpr.in/ is HTTP 200, but /sailorscycle5/, /signUp, /login and /avgapp return HTTP 403 “Forbidden” (footer: “SAILORS CYCLE 5 | STAGE I RESULT”). sailors.navydmpr.in/ssrmedcycle2/signUp and /login are HTTP 200 with no form controls in the static HTML (rendered by script); the page says the INET 2026 edit window closed on 09 June 2026. The older host agniveernavy.cdac.in returned HTTP 503. The homepage lists the INET 2026 AVR (SSR/MR) application as closed. The Agniveer application form was not inspected.",
      },
      limitations: [
        "The public register page collects a photo-ID number and a CAPTCHA. It is account creation, not the Agniveer application, and no adapter is registered.",
        "Agniveer applications run on agniveer.navydmpr.in (SSR/MR) and sailors.navydmpr.in (SSR Medical). Neither is an extension or inspector origin, and adding them needs an explicit decision.",
        "No Navy application window was open on 2026-10-28. Application fields stay blocked until a signed-in capture from a page that actually shows the form.",
        NOT_INJECTED,
      ],
    }),
    entry({
      id: "airforce",
      category: "Air Force",
      service: "Indian Air Force recruitment",
      officialUrl: "https://iafrecruitment.edcil.co.in/agniveervayu/",
      origins: Object.freeze(["https://iafrecruitment.edcil.co.in"]),
      status: STATUS.RESEARCHED,
      verification: {
        checkedOn: RECHECKED_ON,
        method: METHOD,
        result:
          "2026-10-27: https://agnipathvayu.cdac.in/ HTTP 503. https://careerindianairforce.cdac.in/ and https://indianairforce.nic.in/ did not respond. https://airmenselection.cdac.in/CASB/ HTTP 503. https://iafrecruitment.edcil.co.in/ HTTP 200, title “Indian Air Force – Join”, linking to /agniveervayu/ which HTTP 200, title “CASB - Home”, with no application form in the DOM. That page links to DigiALM login.html pages for Agniveervayu intakes 01/2027 (form 97277), Musician 01/2027 (form 101682) and 02/2027 (form 101256). A plain GET of those login pages returned a user-id and password shell (ids userid and confData) plus page text that mentions a CAPTCHA. Headless Chrome received HTTP 403 from cdn.digialm.com. 2026-10-28: unchanged, and the form 97277 login page (title “IAF Agniveervayu Intake 01/2027 : Applicant Login”, form#loginForm posting to /EForms/loginAction.do) answered a plain GET with HTTP 200. The official guidelines page /agniveervayu/guidelines.html describes online registration: valid e-mail and mobile, a Domicile/COAFP category followed by a State/UT list, an Aadhaar number (optional for J&K, Ladakh, Assam and Meghalaya), an online fee of Rs. 550 plus GST, and uploads of certificates, mark sheets, photograph and signature. The Non-Combatant intake uses a paper application (PDF “Application Forms Agniveervayu Non-Combatants” with its own filling guidelines). The online application form was not inspected.",
      },
      limitations: [
        "Reachable recruitment front door is https://iafrecruitment.edcil.co.in/agniveervayu/. The online application is behind applicant login on cdn.digialm.com and was not inspected.",
        "cdn.digialm.com is a shared vendor host and is not an extension origin.",
        "The Non-Combatant intake is a paper form (signature, pasted photograph, posted envelope) and cannot be filled in a browser.",
        "Older catalog hosts agnipathvayu.cdac.in and careerindianairforce.cdac.in were not usable on this check.",
        NOT_INJECTED,
      ],
    }),
    entry({
      id: "india-post",
      category: "India Post",
      service: "India Post services",
      officialUrl: "https://www.indiapost.gov.in/",
      origins: Object.freeze(["https://www.indiapost.gov.in"]),
      status: STATUS.MANUAL,
      verification: { checkedOn: CHECKED_ON, method: METHOD, result: "HTTP 200, title “India Post”. /gdsonlineengagement is the GDS Schedule-II July-2026 notice (no application fields). The candidate app is a different host, recorded under postal-recruitment." },
      limitations: ["Informational portal. The GDS notice on this host has no application fields. Candidate forms are under postal-recruitment and were not publicly rendered.", NOT_INJECTED],
    }),
    entry({
      id: "postal-recruitment",
      category: "Postal recruitment",
      service: "India Post Gramin Dak Sevak (GDS) online engagement",
      officialUrl: "https://gdsrect.indiapost.gov.in/gdscandidate",
      origins: Object.freeze(["https://indiapostgdsonline.gov.in", "https://gdsrect.indiapost.gov.in"]),
      status: STATUS.RESEARCHED,
      verification: {
        checkedOn: CHECKED_ON,
        method: METHOD,
        result:
          "Legacy https://indiapostgdsonline.gov.in/ HTTP 200 is a notice page with no application controls. /Reg_validation.aspx is HTTP 404. https://indiapostgdsonline.cept.gov.in/ is HTTP 503. Official notice https://www.indiapost.gov.in/gdsonlineengagement HTTP 200, title “India Post GDS Online Recruitment | Official Portal”, Schedule-II July-2026: registration 31 Aug 2026–19 Sep 2026 17:00, application submission 2 Sep 2026–21 Sep 2026 17:00, edit window 23–24 Sep 2026. Those windows are closed. The notice links to https://gdsrect.indiapost.gov.in/gdscandidate (HTTP 200), which says registration is closed and shows Candidate Login and Forgot Registration. /gdscandidate/login and /gdscandidate/register return 307 to the landing page with callbackUrl and do not render a form. /gdscandidate/forgot-registration is a public recovery form, not the application: radios name=identifierType values mobile and email, and a text input with placeholder “Enter Mobile Number (10 digits)” and no id or name. Headless Chrome showed the same three controls. The application form was not inspected.",
        monitoring: Object.freeze({
          checkedAt: "2026-10-28T07:24:25Z",
          previousCheckAt: "2026-10-27T11:45:08Z",
          tool: "extension/tools/gds-status.mjs (one GET per page, no retries, at most once every 6 hours)",
          status: "registration-closed",
          evidence:
            "gdsrect.indiapost.gov.in/gdscandidate HTTP 200: “Registration is closed for Schedule II, July - 2026”. www.indiapost.gov.in/gdsonlineengagement HTTP 200, Schedule-II July-2026: user registration 31-08-2026 to 19-09-2026 17:00 HRS, application submission 02-09-2026 to 21-09-2026 17:00 HRS, edit/correction 23-09-2026 to 24-09-2026 17:00 HRS. No new schedule was announced. Unchanged since the previous check.",
        }),
      },
      limitations: [
        "GDS application and registration forms are not publicly rendered. Registration for Schedule-II July-2026 is closed. No adapter is registered.",
        "The public forgot-registration page is account recovery. It is not filled automatically.",
        "The legacy notice host indiapostgdsonline.gov.in has no application fields. indiapostgdsonline.cept.gov.in did not serve a form (HTTP 503).",
        NOT_INJECTED,
      ],
    }),
    entry({
      id: "pmegp",
      category: "PMEGP",
      service: "Prime Minister's Employment Generation Programme",
      officialUrl: "https://pmegp.msme.gov.in/",
      origins: Object.freeze(["https://pmegp.msme.gov.in"]),
      status: STATUS.ADAPTER_PENDING,
      readiness: Object.freeze({
        publicFormInspected: true,
        adapterImplemented: true,
        localFixtureTestsPassed: true,
        postValidationVerified: false,
        realPageFillVerified: false,
      }),
      supervisedTrial: trial({
        adapterVersion: "1.0.0",
        form: "new-unit",
        fields: [
          { selector: "#ux_communication_taluk_block", key: "correspondenceAddress.tehsil", tag: "input", type: "text", maxLength: 20, label: "Taluka / Block / तालुका / ब्लॉक" },
          { selector: "#ux_communication_pin", key: "correspondenceAddress.pincode", tag: "input", type: "text", maxLength: 6, label: "Pin Code / पिन कोड" },
          { selector: "#ux_communication_mobileNo", key: "contact.mobile", tag: "input", type: "text", maxLength: 10, label: "Primary Mobile No / मोबाइल नंबर" },
          { selector: "#ux_communication_emailId", key: "contact.email", tag: "input", type: "email", maxLength: 50, label: "eMail / ई-मेल" },
        ],
      }),
      testCoverage: Object.freeze([
        "per-field decisions for all 98 captured fields (extension/tests/pmegp-coverage.mjs, run by npm run test:extension:adapters)",
        "adapter on a local stand-in of the public capture, Chrome and Edge (extension/tests/pmegp-adapter-smoke.mjs)",
        "shipped manifest on a stand-in served at the real page URL, filling off, Chrome and Edge (extension/tests/pmegp-page-smoke.mjs)",
      ]),
      verification: {
        checkedOn: RECHECKED_ON,
        method: `${METHOD}, then one headless Chrome load of the public page with the read-only inspector capture`,
        result:
          "2026-10-27: information site HTTP 200; https://www.kviconline.gov.in/pmegpeportal/ did not respond. 2026-10-28: www.kviconline.gov.in did not resolve (DNS). The homepage “New Application” link https://pmegp.msme.gov.in/Home/HomePage is HTTP 200 and renders the new-unit application form publicly: 98 fields (46 visible), 22 filtered by the inspector (13 identity, 7 password, 2 CAPTCHA), 17 disabled or read-only. It opens with #ux_aadhar_no and a “Validate Aadhaar” button; name, date of birth, age and gender are disabled until then, and the bank branch fields are disabled behind the page's own IFSC picker. District, sub-district and village lists hold one option until a state is chosen. The same page carries registered-applicant login (user ID, password, CAPTCHA) and six-box OTP verification. The sanitised capture is extension/tests/fixtures/adapters/pmegp-application/. Nothing was typed or submitted. The application was not inspected after Aadhaar validation. Later on 2026-10-28 a second read-only load found the same 98 fields with no change to any mapped or protected field, and the engine's preview of the live page (nothing filled) matched the new-unit form, offered the four mapped fields and resolved every protected selector; the engine made no network request.",
      },
      limitations: [
        "Aadhaar validation and OTP verification come before the application can be saved; both stay with the applicant.",
        "An adapter is written (extension/adapters/pmegp-application.js). It maps four of 98 fields: communication taluka/block, communication PIN, primary mobile and email.",
        "Filling is off. The extension runs only on https://pmegp.msme.gov.in/Home/HomePage*, where it reports this status and reads no field. The adapter is not loaded there and the engine refuses to register it. Once the form after Aadhaar validation has been captured and the four mapped fields are confirmed unchanged and editable in that state, a supervised fill on the real page (a trial of those four fields only, started and approved by the applicant) can be checked. Normal filling stays off until that trial passes and a separate production decision is made.",
        "Several page labels are attached to the wrong control (for example the communication District field is labelled “Aadhaar Card No”), so only fields with their own label and section are mapped.",
        "Aadhaar, PAN, IFSC and the Aadhaar-linked name, date of birth, gender and address are never filled.",
      ],
    }),
    entry({
      id: "pan",
      category: "PAN",
      service: "PAN application (new / correction)",
      officialUrl: "https://eportal.incometax.gov.in/iec/foservices/",
      status: STATUS.MANUAL,
      verification: {
        checkedOn: RECHECKED_ON,
        method: METHOD,
        result:
          "2026-10-27: catalog links (Protean/NSDL and UTIITSL) did not respond. 2026-10-28: the old NSDL host www.onlineservices.nsdl.com does not resolve; www.protean-tinpan.com redirects to https://tinpan.proteantech.in/ (HTTP 200, script-rendered, no fields in the static HTML); https://www.pan.utiitsl.com/ is HTTP 200 with “Click to Apply” pages (/newA.html, /csf.html) that hold no form fields in the static HTML. The Income Tax e-filing portal https://eportal.incometax.gov.in/iec/foservices/ (Instant e-PAN) is HTTP 200 and script-rendered. Protean and UTIITSL are authorised agencies on non-government hosts.",
      },
      limitations: [
        "PAN applications are taken by two authorised agencies on their own hosts and by the Income Tax portal for Instant e-PAN; all three are script-rendered and were not inspected.",
        "These flows rest on Aadhaar e-KYC or OTP, e-sign and online payment, which stay with the applicant.",
        "Full PAN/Aadhaar values are never stored or filled (masked only).",
        NOT_INJECTED,
      ],
    }),
    entry({
      id: "gst",
      category: "GST",
      service: "GST new registration",
      officialUrl: "https://reg.gst.gov.in/registration/",
      origins: Object.freeze(["https://reg.gst.gov.in"]),
      status: STATUS.ADAPTER_PENDING,
      readiness: Object.freeze({
        publicFormInspected: true,
        adapterImplemented: true,
        localFixtureTestsPassed: true,
        postValidationVerified: false,
        realPageFillVerified: false,
      }),
      supervisedTrial: trial({
        adapterVersion: "1.0.0",
        form: "part-a",
        fields: [
          { selector: "#email", key: "contact.email", tag: "input", type: "text", maxLength: 254, label: "Email Address" },
          { selector: "#mobile", key: "contact.mobile", tag: "input", type: "text", maxLength: 10, label: "Mobile Number" },
        ],
      }),
      testCoverage: Object.freeze([
        "per-field decisions for all 8 captured fields (extension/tests/gst-coverage.mjs, run by npm run test:extension:adapters)",
        "adapter on a local stand-in of the public capture, Chrome and Edge (extension/tests/gst-adapter-smoke.mjs)",
        "shipped manifest on a stand-in served at the real page URL, filling off, Chrome and Edge (extension/tests/gst-page-smoke.mjs)",
      ]),
      verification: {
        checkedOn: RECHECKED_ON,
        method: `${METHOD}, then one headless Chrome load of the public page with the read-only inspector capture`,
        result:
          "2026-10-27: HTTP 200, title “Goods & Services Tax (GST) | Registration”. 2026-10-28: the static HTML has no form controls (rendered by script). The official user manual (https://tutorial.gst.gov.in/userguide/registration/Apply_for_Registration_Normal_Taxpayer.htm) documents Part A, separate mobile and e-mail OTPs, then a Temporary Reference Number (TRN). Part B opens only after TRN sign-in. Later on 2026-10-28 a headless Chrome load of https://reg.gst.gov.in/registration/ settled with the read-only inspector. Nothing was typed or clicked. The page is form[name=preg], 8 fields: radios name=typ (New Registration and Temporary Reference Number), select#applnType “I am a” (10 options), select#applnState “State/UT” (38 options), select#applnDistr “District” (only Select), #bnm legal name as mentioned in PAN, #pan_card, #email (maxlength 254) and #mobile (maxlength 10). No CAPTCHA, OTP, password or file control was in that DOM. The submit control is a Proceed button and was not used. Every request during that load was a GET. The sanitised capture is extension/tests/fixtures/adapters/gst-registration/. The page after Proceed, and the district list after a state is chosen, were not captured.",
      },
      limitations: [
        "An adapter is written (extension/adapters/gst-registration.js). It maps two of 8 fields: email and mobile.",
        "Filling is off. The extension runs only on https://reg.gst.gov.in/registration*, where it reports this status and reads no field. The adapter is not loaded there and the engine refuses to register it. Once the page after Proceed has been captured and the two mapped fields are confirmed unchanged and editable on it, a supervised fill on the real page (a trial of those two fields only, started and approved by the applicant) can be checked. Normal filling stays off until that trial passes and a separate production decision is made.",
        "PAN and the legal name as mentioned in PAN are never filled. State/UT and District are the place of registration, not the applicant's address, and the district list was empty.",
        "Proceed, OTP, CAPTCHA, TRN sign-in, Part B, uploads and payment stay with the applicant. No CAPTCHA control was present on the captured page.",
      ],
    }),
    entry({
      id: "police-verification",
      category: "Police verification",
      service: "Police verification applications",
      officialUrl: null,
      status: STATUS.MANUAL,
      verification: {
        checkedOn: RECHECKED_ON,
        method: METHOD,
        result:
          "2026-10-27: no single national application portal verified; https://digitalpolice.gov.in/ (MHA) responded. 2026-10-28: digitalpolice.gov.in is HTTP 200 with a state selector and a PDF guide “How to get Police Clearance Certificate (PCC)”. Example state service: Maharashtra https://pcs.mahaonline.gov.in/Forms/Home.aspx is HTTP 200 and opens with a sign-in form (user name, password, CAPTCHA). Passport Seva (https://www.passportindia.gov.in/psp), which issues PCCs for passports, is HTTP 200 and script-rendered.",
      },
      limitations: ["State-specific portals and procedures. The state example checked requires applicant sign-in with a CAPTCHA.", NOT_INJECTED],
    }),
    entry({
      id: "domicile",
      category: "Domicile",
      service: "Domicile / residence certificate",
      officialUrl: "https://serviceonline.gov.in/",
      status: STATUS.MANUAL,
      verification: {
        checkedOn: RECHECKED_ON,
        method: METHOD,
        result:
          "2026-10-27: HTTP 200, title “Service Plus” (catalog link). 2026-10-28: serviceonline.gov.in served an incomplete TLS certificate chain to a plain client. Maharashtra Aaple Sarkar (aaplesarkar.mahaonline.gov.in) timed out. Karnataka Nadakacheri (https://nadakacheri.karnataka.gov.in/ajsk) is HTTP 200; its “Apply Online” page https://ajsk.karnataka.gov.in/nk5_online/Login/Login_Public asks for a mobile number, OTP and CAPTCHA before any application. It publishes user manuals and a documents-required list.",
      },
      limitations: [
        "Issued by state governments through state-specific deployments; the applicant's state determines the form.",
        "The state service checked requires mobile OTP sign-in and supporting documents.",
        NOT_INJECTED,
      ],
    }),
    entry({
      id: "khata",
      category: "Khata",
      service: "Khata (property record) services",
      officialUrl: null,
      status: STATUS.MANUAL,
      verification: {
        checkedOn: RECHECKED_ON,
        method: METHOD,
        result:
          "2026-10-27: municipality-specific; https://bbmpeaasthi.karnataka.gov.in/ (BBMP) responded. 2026-10-28: BBMP e-Aasthi is HTTP 200 with a script-rendered shell (no links or fields in the static HTML). Rural Karnataka properties use E-Swathu 2.0 (https://eswathu.karnataka.gov.in/, HTTP 200, information and citizen-service links).",
      },
      limitations: ["Issuing authority depends on the municipality (urban) or panchayat (rural). Property records need owner documents and official verification.", NOT_INJECTED],
    }),
    entry({
      id: "other",
      category: "Other government services",
      service: "Other government services",
      officialUrl: null,
      status: STATUS.MANUAL,
      verification: { checkedOn: CHECKED_ON, method: "Not applicable", result: "Catch-all category." },
      limitations: ["Handled manually until a portal-specific adapter is researched, built and verified.", NOT_INJECTED],
    }),
  ]);

  function list() {
    return PORTALS;
  }

  function byId(id) {
    return PORTALS.find((p) => p.id === id) || null;
  }

  /** Exact-origin identification against registry entries (no suffix or substring matching). */
  function identify(url) {
    let origin;
    try {
      origin = new URL(String(url)).origin;
    } catch {
      return null;
    }
    return PORTALS.find((p) => p.origins.includes(origin)) || null;
  }

  /** Structural validation used by tests and at adapter registration. Returns a list of problems. */
  function validate(entries = PORTALS) {
    const problems = [];
    const ids = new Set();
    for (const p of entries) {
      if (!/^[a-z0-9-]+$/.test(p.id) || ids.has(p.id)) problems.push(`${p.id}: bad or duplicate id`);
      ids.add(p.id);
      if (!Object.values(STATUS).includes(p.status)) problems.push(`${p.id}: unknown status`);
      if (p.officialUrl !== null && !/^https:\/\/[a-z0-9.-]+\/[^\s]*$/.test(p.officialUrl)) problems.push(`${p.id}: officialUrl must be https or null`);
      if (p.officialUrl && !p.verification?.checkedOn) problems.push(`${p.id}: officialUrl without verification record`);
      for (const o of p.origins) if (!/^https:\/\/[a-z0-9.-]+$/.test(o)) problems.push(`${p.id}: origin ${o} must be an exact https origin`);
      if (p.origins.length && !p.officialUrl) problems.push(`${p.id}: origins without a verified officialUrl`);
      const supported = p.status === STATUS.VERIFIED_SUPPORTED;
      const supervised = p.status === STATUS.SUPERVISED;
      if ((supported || supervised) !== Boolean(p.adapterId)) problems.push(`${p.id}: verified_supported and supervised_verification_only each requires an adapter (and vice versa)`);
      if (supported && (!p.supportedForms.length || !p.supportedFields.length || p.testCoverage === REGISTRY_ONLY)) problems.push(`${p.id}: supported portal needs forms, fields and tests`);
      const r = p.readiness;
      const wellFormed = r === null || (!!r && typeof r === "object" && Object.keys(r).join() === READINESS.join() && READINESS.every((k) => typeof r[k] === "boolean"));
      if (!wellFormed) problems.push(`${p.id}: readiness must be null or record ${READINESS.join(", ")} as booleans`);
      const ready = wellFormed && r !== null && READINESS.every((k) => r[k] === true);
      if (supported && !ready) problems.push(`${p.id}: verified_supported requires every readiness check to pass`);
      if (p.status === STATUS.ADAPTER_PENDING && (!wellFormed || !r?.adapterImplemented || ready)) problems.push(`${p.id}: adapter_pending_verification needs a written adapter and an unfinished readiness record`);
      if (supervised && !(wellFormed && r !== null && TRIAL_READINESS.every((k) => r[k] === true))) problems.push(`${p.id}: supervised_verification_only requires ${TRIAL_READINESS.join(", ")} to pass`);
      if (r && p.status !== STATUS.ADAPTER_PENDING && !supported && !supervised) problems.push(`${p.id}: a readiness record belongs to a pending, supervised or supported adapter`);
      if (p.supervisedTrial !== null) {
        for (const m of validateTrial(p.supervisedTrial)) problems.push(`${p.id}: supervisedTrial ${m}`);
        if (!r) problems.push(`${p.id}: a supervised trial belongs to a portal with a readiness record`);
      }
      if (supervised && p.supervisedTrial === null) problems.push(`${p.id}: supervised_verification_only requires a supervisedTrial`);
      if (!Array.isArray(p.limitations) || !p.limitations.length) problems.push(`${p.id}: limitations required`);
    }
    return problems;
  }

  /** Problems with a supervised trial declaration (registry entries and test adapters). */
  function validateTrial(t) {
    if (!t || typeof t !== "object" || Object.keys(t).join() !== "adapterVersion,form,fields") return ["must record adapterVersion, form and fields"];
    const p = [];
    if (!VERSION_RE.test(t.adapterVersion)) p.push("adapterVersion must look like 1.0.0");
    if (!/^[a-z0-9-]{2,40}$/.test(t.form)) p.push("bad form id");
    if (!Array.isArray(t.fields) || t.fields.length < 1 || t.fields.length > 10) return [...p, "needs 1 to 10 fields"];
    for (const f of t.fields) {
      if (!f || typeof f !== "object" || Object.keys(f).join() !== TRIAL_FIELD_KEYS.join()) {
        p.push(`field must record ${TRIAL_FIELD_KEYS.join(", ")}`);
        continue;
      }
      const ok =
        typeof f.selector === "string" && f.selector.length > 0 && f.selector.length <= 120 && typeof f.key === "string" && /^[A-Za-z.]{1,60}$/.test(f.key) &&
        ["input", "select", "textarea"].includes(f.tag) && (f.tag === "input" ? typeof f.type === "string" && /^[a-z-]{1,20}$/.test(f.type) : f.type === null) &&
        Number.isInteger(f.maxLength) && f.maxLength >= 0 && f.maxLength <= 100000 && typeof f.label === "string" && f.label.length > 0 && f.label.length <= 200;
      if (!ok) p.push(`field ${String(f.selector).slice(0, 40)}: malformed`);
    }
    const unique = (k) => new Set(t.fields.map((f) => f?.[k])).size === t.fields.length;
    if (!unique("selector") || !unique("key")) p.push("selectors and keys must be unique");
    return p;
  }

  /** Whether an adapter is exactly the one a supervised trial was declared for: same version, one form, the same mappings, no heuristics. */
  function trialMatches(t, a) {
    if (!t || !a || validateTrial(t).length || a.version !== t.adapterVersion || !Array.isArray(a.forms) || a.forms.length !== 1) return false;
    const f = a.forms[0];
    const pairs = (list) => (list || []).map((m) => `${m.selector}\u0000${m.key}`).sort().join("\u0001");
    return f.id === t.form && f.genericFields === false && (f.fields || []).length === t.fields.length && pairs(f.fields) === pairs(t.fields);
  }

  /** "production", "supervised" or null: what a registered production adapter may do. Only verified_supported fills normally. */
  function fillMode(e, a) {
    if (!e || !a || !e.adapterId || e.adapterId !== a.id || validate([e]).length) return null;
    if (e.status === STATUS.VERIFIED_SUPPORTED) return "production";
    if (e.status === STATUS.SUPERVISED && trialMatches(e.supervisedTrial, a)) return "supervised";
    return null;
  }

  MC.registry = Object.freeze({ STATUS, STATUS_LABELS, READINESS, TRIAL_READINESS, list, byId, identify, validate, validateTrial, trialMatches, fillMode });
})(globalThis);
