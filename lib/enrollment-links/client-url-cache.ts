/** Browser-only cache so admins can re-copy invite URLs after create/regenerate. */

const STORAGE_PREFIX = "dsx.enrollmentLinkUrl.";

export function rememberEnrollmentLinkUrl(linkId: string, url: string) {
  if (typeof window === "undefined" || !linkId || !url) return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${linkId}`, url);
  } catch {
    // ignore quota / private mode
  }
}

export function recallEnrollmentLinkUrl(linkId: string): string | null {
  if (typeof window === "undefined" || !linkId) return null;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${linkId}`);
  } catch {
    return null;
  }
}
