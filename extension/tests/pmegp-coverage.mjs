/**
 * Decision for every field in the PMEGP public capture (tests/fixtures/adapters/pmegp-application/).
 * mapped: filled by the adapter. protected: listed in the adapter's protectedSelectors.
 * ambiguous: its meaning cannot be fixed from the page (mismatched or missing label, or a value the
 * applicant profile cannot decide). unsupported: no applicant-profile value exists for it, or it
 * belongs to another flow on the same page. Tests require this table to cover the capture exactly.
 */
const otp = (container, reason) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`${container} > input:nth-of-type(${n})`, ["protected", reason]]));
const AADHAAR_DERIVED = "set by the page from Aadhaar validation";
const UNIT = "business unit location, not the applicant's address";
const PROJECT = "project detail with no applicant-profile value";
const BANK = "bank detail with no applicant-profile value";
const SECOND_LOAN = "second-loan application, a different flow";

export const PMEGP_FIELD_DECISIONS = Object.freeze({
  "#ux_aadhar_no": ["protected", "Aadhaar number"],
  "#ux_communication_panNo": ["protected", "PAN"],
  "#ux_applicant_title": ["unsupported", "salutation; the profile has none, and deriving it from gender would be a guess"],
  "#ux_applicant_name": ["protected", AADHAAR_DERIVED],
  "#ux_DateOfBirth": ["protected", AADHAAR_DERIVED],
  "#ux_age": ["protected", AADHAAR_DERIVED],
  "#ux_Gender": ["protected", AADHAAR_DERIVED],
  "#ux_legal_type": ["unsupported", "hidden and disabled; no applicant-profile value"],
  "#ux_social_category": ["ambiguous", "the list mixes caste category with Minority, and the profile has no minority status"],
  "#ux_SpecialCategory": ["unsupported", "ex-serviceman, disability and region categories are not in the profile"],
  "#ux_Qualification": ["unsupported", "highest qualification is not in the profile; inferring it from education records is not evidence"],
  "#ux_communication_address": ["protected", "address line tied to Aadhaar (filtered as identity in the capture)"],
  "#ux_AadharState": ["protected", "state tied to Aadhaar (filtered as identity in the capture)"],
  "#ux_communication_District": ["protected", "disabled district control whose placeholder reads Aadhaar Card No"],
  "#ux_communication_taluk_block": ["mapped", "<label for> Taluka / Block, section Communication Address"],
  "#ux_communication_pin": ["mapped", "<label for> Pin Code, section Communication Address, maxlength 6"],
  "#ux_communication_mobileNo": ["mapped", "<label for> Primary Mobile No, section Communication Address, maxlength 10"],
  "#ux_communication_secondary_mobileNo": ["unsupported", "the profile has one mobile number; it must not be copied here"],
  "#ux_communication_emailId": ["mapped", "type email, <label for> eMail, section Communication Address"],
  "#ux_SameAddressCheck": ["unsupported", "whether the unit is at the applicant's address is a business fact"],
  "#ux_State": ["unsupported", UNIT],
  "#ux_District": ["unsupported", `${UNIT}; dependent list never populated in the capture`],
  "#ux_UnitAddress_subdistrict": ["unsupported", `${UNIT}; dependent list never populated in the capture`],
  "#ux_UnitAddress_village": ["unsupported", `${UNIT}; dependent list never populated in the capture`],
  "#ux_UnitAddress_village_text": ["unsupported", UNIT],
  "#ux_UnitAddress_LGDCode": ["ambiguous", "disabled; its only label is its own id"],
  "#ux_UnitAddress_pin": ["unsupported", UNIT],
  "#ux_UnitAddress_UnitLocation": ["unsupported", UNIT],
  "#ux_UnitAddress_UnitAddress": ["ambiguous", "Unit Address whose Hindi label reads correspondence address"],
  "#ux_sponsoring_agency": ["unsupported", PROJECT],
  "#ux_SponsoringOfficeName": ["unsupported", PROJECT],
  "#ux_ProjectInformation_activityType": ["unsupported", PROJECT],
  "#ux_ProjectInformation_subscheme": ["unsupported", PROJECT],
  "#ux_ProjectInformation_isTrainingUndergone": ["unsupported", PROJECT],
  'input[type="radio"][name="trainingmode"]': ["unsupported", PROJECT],
  "#ux_ProjectInformation_trainingInstnName": ["ambiguous", "training institute control whose placeholder reads Age"],
  "#ux_ProjectInformation_capitalExpenditure": ["unsupported", PROJECT],
  "#ux_ProjectInformation_workingCapital": ["unsupported", PROJECT],
  "#ux_ProjectInformation_total": ["unsupported", `${PROJECT}; read-only total`],
  "#ux_ProjectInformation_Employment": ["unsupported", PROJECT],
  "#ux_financingBank_bankName": ["unsupported", BANK],
  "#ux_financingBank_ifsCode": ["protected", "IFSC, set by the page's IFSC picker"],
  "#ux_financingBank_branchName": ["unsupported", `${BANK}; set by the page's IFSC picker`],
  "#ux_financingBank_address": ["protected", "bank address control whose placeholder reads Aadhaar Card No"],
  "#ux_financingBank_district": ["protected", "bank district control whose placeholder reads Aadhaar Card No"],
  "#ux_alternateFinancingBank_bankName": ["unsupported", BANK],
  "#ux_alternateFinancingBank_ifsCode": ["protected", "IFSC, set by the page's IFSC picker"],
  "#ux_alternateFinancing_bankBranch": ["unsupported", `${BANK}; set by the page's IFSC picker`],
  "#ux_alternateFinancing_bankAddress": ["ambiguous", "bank address control whose placeholder reads Branch Name"],
  "#ux_alternateFinancing_bankDist": ["ambiguous", "bank district control whose placeholder reads Branch Name"],
  "#ux_alternateFinancingBank_availCgtmse": ["unsupported", BANK],
  "#ux_check_availCgtmse_warning": ["unsupported", `${BANK}; hidden acknowledgement`],
  "#ux_alternateFinancingBank_hearAboutPmegp": ["unsupported", "survey question with no applicant-profile value"],
  "#ux_applicantLogin_userID": ["protected", "sign-in"],
  "#ux_applicantLogin_password": ["protected", "password"],
  "#ux_applicantLogin_captchaInput": ["protected", "CAPTCHA"],
  'input[type="radio"][name="verifyMethod"]': ["protected", "OTP channel"],
  ...otp("#ux_otpBoxesContainer", "OTP"),
  "#ux_LoanAvail_Sec": ["unsupported", SECOND_LOAN],
  "#ux_StateSec": ["unsupported", SECOND_LOAN],
  "#ux_DistrictSec": ["unsupported", SECOND_LOAN],
  "#ux_applicationID_Sec": ["unsupported", SECOND_LOAN],
  "#ux_UdyogAadharNo": ["protected", "Udyam registration number"],
  "#ux_aadhar_No_Sec": ["protected", "Aadhaar number"],
  "#ux_communication_PanNoSec": ["protected", "PAN"],
  "#ux_SecapplicantLogin_userID": ["protected", "sign-in"],
  "#ux_SecapplicantLogin_password": ["protected", "password"],
  "#ux_SecapplicantLogin_captchaInputs": ["protected", "CAPTCHA"],
  'input[type="radio"][name="secVerifyMethod"]': ["protected", "OTP channel"],
  ...otp("#ux_SecOtpBoxesContainer", "OTP"),
  'input[type="radio"][name="fpUniversalVerifyMethod"]': ["protected", "OTP channel"],
  ...otp("#ux_fp_universal_otpBoxes", "OTP"),
  "#ux_fp_universal_newPassword": ["protected", "password"],
  "#ux_fp_universal_confirmPassword": ["protected", "password"],
  "#ux_nodalAgencyLogin_userID": ["protected", "official sign-in"],
  "#ux_nodalAgencyLogin_password": ["protected", "password"],
  "#ux_edpLogin_userID": ["protected", "official sign-in"],
  "#ux_edpLogin_password": ["protected", "password"],
  "#ux_bankLogin_userID": ["protected", "official sign-in"],
  "#ux_bankLogin_password": ["protected", "password"],
  'textarea[placeholder="Describe your issues here..."]': ["unsupported", "translation widget feedback"],
  "#suggested-feedback-checkbox": ["unsupported", "translation widget feedback"],
  'textarea[placeholder="Suggested Feedback"]': ["unsupported", "translation widget feedback"],
});

/** Whether one of the adapter's protected selectors covers a captured selector. */
export function coveredByProtection(protectedSelectors, selector) {
  return protectedSelectors.some((s) => {
    const within = /^(#[\w-]+) ([a-z]+)$/.exec(s);
    return s === selector || (within && selector.startsWith(`${within[1]} > ${within[2]}`));
  });
}
