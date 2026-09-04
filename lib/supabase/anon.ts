import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createSupabaseFetch } from "@/lib/supabase/fetch-retry";

/** Cookie-less anon client for public ISR pages. RLS still applies. */
export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: createSupabaseFetch({ retries: 2, timeoutMs: 12_000 }) },
    },
  );
}
