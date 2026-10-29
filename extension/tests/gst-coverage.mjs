/**
 * Decision for every field in the GST part A public capture
 * (tests/fixtures/adapters/gst-registration/).
 * mapped: filled by the adapter. protected: listed in the adapter's protectedSelectors.
 * ambiguous: its meaning cannot be fixed from the page.
 * unsupported: no applicant-profile value exists for it, or it is a different flow on the same page.
 */
const PLACE = "place of GST registration, not the applicant's address";

export const GST_FIELD_DECISIONS = Object.freeze({
  'input[type="radio"][name="typ"]': ["unsupported", "switches between this form and Temporary Reference Number continuation"],
  "#applnType": ["unsupported", "taxpayer category; the profile has none, and choosing one resets the form"],
  "#applnState": ["unsupported", `${PLACE}; choosing it loads the district list, which was not captured`],
  "#applnDistr": ["unsupported", `${PLACE}; the list holds only Select until a state is chosen`],
  "#bnm": ["protected", "legal name as mentioned in PAN"],
  "#pan_card": ["protected", "PAN"],
  "#email": ["mapped", "<label for> Email Address, section New Registration, maxlength 254"],
  "#mobile": ["mapped", "<label for> Mobile Number, section New Registration, maxlength 10"],
});
