// Masked OTP-call helpers now live in requests.api (single requests resource).
// Re-exported here for backward-compatible imports.
export { requestOtpCall, getCallLogs } from "@/api/requests.api";
