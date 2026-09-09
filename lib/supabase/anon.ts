import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createSupabaseFetch } from "@/lib/supabase/fetch-retry";
import { getServerSupabaseUrl } from "@/lib/supabase/url";

/** Cookie-less anon client for public ISR pages. RLS still applies. */
export function createAnonClient() {
  const supabaseUrl = getServerSupabaseUrl();
  if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase URL / anon key is not configured");
  }
  return createClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: createSupabaseFetch({ retries: 2, timeoutMs: 12_000 }) },
    },
  );
}
