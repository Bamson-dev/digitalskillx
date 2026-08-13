import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isMissingRelationError } from "@/lib/schema-guard";

export type ContentFactoryBlockKind = "playlist_id" | "channel_id";

export async function isContentFactoryBlocked(
  admin: SupabaseClient<Database>,
  kind: ContentFactoryBlockKind,
  value: string,
): Promise<boolean> {
  const normalized = value.trim();
  if (!normalized) return false;
  const { data, error } = await admin
    .from("content_factory_blocks")
    .select("id")
    .eq("kind", kind)
    .eq("value", normalized)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message)) return false;
    throw new Error(error.message);
  }
  return Boolean(data);
}

export async function blockContentFactorySource(
  admin: SupabaseClient<Database>,
  params: {
    kind: ContentFactoryBlockKind;
    value: string;
    reason?: string;
    createdBy?: string | null;
  },
) {
  const value = params.value.trim();
  if (!value) throw new Error("Block value is required.");
  const { data, error } = await admin
    .from("content_factory_blocks")
    .upsert(
      {
        kind: params.kind,
        value,
        reason: params.reason?.trim() ?? "",
        created_by: params.createdBy ?? null,
      },
      { onConflict: "kind,value" },
    )
    .select("*")
    .single();
  if (error) {
    if (isMissingRelationError(error.message)) {
      throw new Error("Content Factory discovery tables missing — apply migration 0043.");
    }
    throw new Error(error.message);
  }
  return data;
}

export async function listContentFactoryBlocks(
  admin: SupabaseClient<Database>,
  query?: string,
) {
  let req = admin
    .from("content_factory_blocks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const needle = query?.trim().replace(/[%*,()]/g, "").slice(0, 80);
  if (needle) req = req.or(`value.ilike.%${needle}%,reason.ilike.%${needle}%`);
  const { data, error } = await req;
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function unblockContentFactorySource(
  admin: SupabaseClient<Database>,
  params: { kind: ContentFactoryBlockKind; value: string },
) {
  const value = params.value.trim();
  if (!value) throw new Error("Block value is required.");
  const { error } = await admin
    .from("content_factory_blocks")
    .delete()
    .eq("kind", params.kind)
    .eq("value", value);
  if (error) {
    if (isMissingRelationError(error.message)) {
      throw new Error("Content Factory discovery tables missing — apply migration 0043.");
    }
    throw new Error(error.message);
  }
}
