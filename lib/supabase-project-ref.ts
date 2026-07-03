/** Project ref from NEXT_PUBLIC_SUPABASE_URL (e.g. abcdefghijklmnop). */
export function supabaseProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = url.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}
