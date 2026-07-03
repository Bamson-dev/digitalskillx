export function authQueryErrorMessage(code?: string | null): string | undefined {
  switch (code) {
    case "auth_callback_failed":
      return "That sign-in link expired or could not be verified. Request a new link and try again.";
    case "auth_link_invalid":
      return "That link is invalid or has expired. Request a new reset or sign-in link.";
    case "no_profile":
      return "Your account is missing a profile. Sign in again or contact support.";
    case "account_suspended":
      return "This account has been suspended. Contact support for help.";
    default:
      return undefined;
  }
}
