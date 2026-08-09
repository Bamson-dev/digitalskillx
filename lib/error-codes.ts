/**
 * Internal failure identifiers for structured logs and admin diagnostics.
 * Never expose stack traces or secrets to end users — map to friendly messages instead.
 */
export const ErrorCode = {
  AUTH_FAILED: "AUTH_FAILED",
  AUTH_RATE_LIMITED: "AUTH_RATE_LIMITED",
  PAYMENT_VERIFICATION_FAILED: "PAYMENT_VERIFICATION_FAILED",
  PAYMENT_INITIALIZE_FAILED: "PAYMENT_INITIALIZE_FAILED",
  ENROLLMENT_FAILED: "ENROLLMENT_FAILED",
  ENROLLMENT_LINK_FAILED: "ENROLLMENT_LINK_FAILED",
  EMAIL_DELIVERY_FAILED: "EMAIL_DELIVERY_FAILED",
  AUTOMATION_FAILED: "AUTOMATION_FAILED",
  IMPORT_FAILED: "IMPORT_FAILED",
  SALES_PAGE_IMPORT_FAILED: "SALES_PAGE_IMPORT_FAILED",
  STORAGE_UPLOAD_FAILED: "STORAGE_UPLOAD_FAILED",
  STORAGE_DOWNLOAD_FAILED: "STORAGE_DOWNLOAD_FAILED",
  DATABASE_QUERY_FAILED: "DATABASE_QUERY_FAILED",
  CERTIFICATE_GENERATION_FAILED: "CERTIFICATE_GENERATION_FAILED",
  BACKGROUND_JOB_FAILED: "BACKGROUND_JOB_FAILED",
  API_FAILURE: "API_FAILURE",
  RATE_LIMITED: "RATE_LIMITED",
  HEALTH_CHECK_FAILED: "HEALTH_CHECK_FAILED",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Safe customer-facing messages for known failure classes. */
export function userFacingError(code: ErrorCodeValue): string {
  switch (code) {
    case ErrorCode.AUTH_FAILED:
      return "Sign-in failed. Check your email and password.";
    case ErrorCode.AUTH_RATE_LIMITED:
    case ErrorCode.RATE_LIMITED:
      return "Too many attempts. Please wait a moment and try again.";
    case ErrorCode.PAYMENT_VERIFICATION_FAILED:
    case ErrorCode.PAYMENT_INITIALIZE_FAILED:
      return "Payment could not be completed. If you were charged, contact support with your reference.";
    case ErrorCode.ENROLLMENT_FAILED:
    case ErrorCode.ENROLLMENT_LINK_FAILED:
      return "Enrollment could not be completed. Please try again or contact support.";
    case ErrorCode.EMAIL_DELIVERY_FAILED:
      return "We could not send that email right now. Please try again later.";
    case ErrorCode.IMPORT_FAILED:
    case ErrorCode.SALES_PAGE_IMPORT_FAILED:
      return "Import failed. Check the file and try again.";
    case ErrorCode.STORAGE_UPLOAD_FAILED:
    case ErrorCode.STORAGE_DOWNLOAD_FAILED:
      return "File storage is temporarily unavailable. Please try again.";
    case ErrorCode.CERTIFICATE_GENERATION_FAILED:
      return "Certificate could not be generated. Please try again or contact support.";
    default:
      return "Something went wrong. Please try again.";
  }
}
