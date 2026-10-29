// PMEGP new-unit application, https://pmegp.msme.gov.in/Home/HomePage.
// Built only from the sanitised public capture in tests/fixtures/adapters/pmegp-application/
// (the page before Aadhaar validation). Not loaded by any manifest, and the engine refuses to
// register it while the registry entry is not verified_supported.
//
// Only fields whose meaning is fixed by their own <label for>, section and control are mapped.
// genericFields is false: nothing else on the page is mapped by heuristics, because several of its
// labels are attached to the wrong control (for example #ux_communication_District carries the
// placeholder "Aadhaar Card No", and #ux_UnitAddress_UnitAddress is labelled in Hindi as the
// correspondence address).
(function (root) {
  "use strict";
  root.MCEngine.adapters.register({
    id: "pmegp-application",
    version: "1.0.0",
    portalId: "pmegp",
    origins: ["https://pmegp.msme.gov.in"],
    forms: [
      {
        id: "new-unit",
        name: "PMEGP application for new unit",
        match: { pathPrefix: "/Home/HomePage", titleIncludes: "PMEGP" },
        genericFields: false,
        fields: [
          { selector: "#ux_communication_taluk_block", key: "correspondenceAddress.tehsil" },
          { selector: "#ux_communication_pin", key: "correspondenceAddress.pincode" },
          { selector: "#ux_communication_mobileNo", key: "contact.mobile" },
          { selector: "#ux_communication_emailId", key: "contact.email" },
        ],
        protectedSelectors: [
          // Aadhaar, PAN and the details the page takes from Aadhaar validation.
          "#ux_aadhar_no",
          "#ux_communication_panNo",
          "#ux_applicant_name",
          "#ux_DateOfBirth",
          "#ux_age",
          "#ux_Gender",
          "#ux_communication_address",
          "#ux_AadharState",
          "#ux_communication_District",
          // Bank identifiers, filled by the page's own IFSC picker.
          "#ux_financingBank_ifsCode",
          "#ux_financingBank_address",
          "#ux_financingBank_district",
          "#ux_alternateFinancingBank_ifsCode",
          // Second-loan application identifiers.
          "#ux_UdyogAadharNo",
          "#ux_aadhar_No_Sec",
          "#ux_communication_PanNoSec",
          // Sign-in, CAPTCHA, OTP and password reset.
          "#ux_applicantLogin_userID",
          "#ux_applicantLogin_password",
          "#ux_applicantLogin_captchaInput",
          "#ux_SecapplicantLogin_userID",
          "#ux_SecapplicantLogin_password",
          "#ux_SecapplicantLogin_captchaInputs",
          "input[type=\"radio\"][name=\"verifyMethod\"]",
          "input[type=\"radio\"][name=\"secVerifyMethod\"]",
          "input[type=\"radio\"][name=\"fpUniversalVerifyMethod\"]",
          "#ux_otpBoxesContainer input",
          "#ux_SecOtpBoxesContainer input",
          "#ux_fp_universal_otpBoxes input",
          "#ux_fp_universal_newPassword",
          "#ux_fp_universal_confirmPassword",
          "#ux_nodalAgencyLogin_userID",
          "#ux_nodalAgencyLogin_password",
          "#ux_edpLogin_userID",
          "#ux_edpLogin_password",
          "#ux_bankLogin_userID",
          "#ux_bankLogin_password",
        ],
      },
    ],
  });
})(globalThis);
