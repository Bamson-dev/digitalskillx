/** Project ref from NEXT_PUBLIC_SUPABASE_URL (e.g. abcdefghijklmnop). */
export function supabaseProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co\/?$/);
  return match?.[1] ?? null;
}
