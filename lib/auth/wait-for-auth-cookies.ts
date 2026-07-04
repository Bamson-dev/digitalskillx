import type { SupabaseClient } from "@supabase/supabase-js";

type PendingCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

/**
 * @supabase/ssr writes auth cookies in an async onAuthStateChange handler.
 * Route handlers must wait for that before returning a redirect.
 */
export function waitForSignedInCookies(
  supabase: SupabaseClient,
  pending: PendingCookie[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: { unsubscribe: () => void };

    const finish = (ok: boolean, message?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      if (ok) resolve();
      else reject(new Error(message ?? "Session cookies were not written"));
    };

    const timer = setTimeout(() => {
      if (pending.some((c) => c.name.includes("-auth-token") && c.value.length > 0)) {
        finish(true);
      } else {
        finish(false, "Timed out waiting for session cookies after sign-in");
      }
    }, 8000);

    subscription = supabase.auth.onAuthStateChange(async (event) => {
      if (event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED") return;

      for (let i = 0; i < 200; i++) {
        const hasSessionCookie = pending.some(
          (c) => c.name.includes("-auth-token") && c.value.length > 0,
        );
        if (hasSessionCookie) {
          finish(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 5));
      }
    }).data.subscription;
  });
}
