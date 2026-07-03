"use client";

import { useEffect } from "react";

/** Full-page navigation after auth — ensures Supabase session cookies apply (useFormState blocks redirect()). */
export function useAuthRedirect(state: { redirectTo?: string }) {
  useEffect(() => {
    if (state.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state.redirectTo]);
}
