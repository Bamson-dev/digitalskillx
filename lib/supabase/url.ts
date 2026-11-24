/**
 * Legacy URL helpers. DigitalSkillX no longer talks to a Supabase gateway, so all of
 * these return undefined. They stay so older call sites compile until removed.
 */
export function getAuthSupabaseUrl(): string | undefined {
  return undefined;
}
export function getMiddlewareSupabaseUrl(): string | undefined {
  return undefined;
}
export function getAdminSupabaseUrl(): string | undefined {
  return undefined;
}
export function getServerSupabaseUrl(): string | undefined {
  return undefined;
}
