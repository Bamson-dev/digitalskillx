import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { createSupabaseFetch } from "@/lib/supabase/fetch-retry";
import { getServerSupabaseUrl } from "@/lib/supabase/url";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Bound to the request cookie store so the user's session is available
 * server-side. RLS is enforced for this client.
 */
export function createClient() {
  const cookieStore = cookies();
  const supabaseUrl = getServerSupabaseUrl();
  if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase URL / anon key is not configured");
  }

  return createServerClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` can be called from a Server Component where mutating
            // cookies is not allowed. Session refresh is handled in middleware,
            // so this is safe to ignore.
          }
        },
      },
      global: { fetch: createSupabaseFetch({ retries: 2, timeoutMs: 12_000 }) },
    },
  );
}
