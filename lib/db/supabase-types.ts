import type { DbClient } from "./client";

/**
 * Type-only compatibility alias. Older modules still write
 * `import type { SupabaseClient } from "@supabase/supabase-js"`; tsconfig `paths` maps that
 * specifier here, so the type is the PostgreSQL client. Nothing from the Supabase packages
 * is installed or loaded at runtime. New code should import `DbClient` from "@/lib/db/client".
 */
export type SupabaseClient<_Database = unknown, _Schema = unknown> = DbClient;
