import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function listTagCatalog(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("tag_catalog")
    .select("id, slug, label, color, created_at")
    .order("label");
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function upsertTagCatalog(
  admin: SupabaseClient,
  input: { id?: string; label: string; color?: string; createdBy?: string | null },
) {
  const label = input.label.trim().slice(0, 80);
  if (!label) throw new Error("Tag label is required.");
  const slug = slugify(label);
  if (!slug) throw new Error("Invalid tag label.");

  if (input.id) {
    const { data, error } = await admin
      .from("tag_catalog")
      .update({ label, slug, color: input.color ?? null, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select("id, slug, label, color")
      .single();
    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        throw new Error("A tag with that name already exists.");
      }
      throw new Error(error.message);
    }
    return data;
  }

  const { data, error } = await admin
    .from("tag_catalog")
    .insert({
      label,
      slug,
      color: input.color ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id, slug, label, color")
    .single();
  if (error) {
    if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
      throw new Error("A tag with that name already exists.");
    }
    throw new Error(error.message);
  }
  return data;
}

export async function renameTagAcrossProfiles(
  admin: SupabaseClient,
  oldLabel: string,
  newLabel: string,
) {
  const from = oldLabel.trim();
  const to = newLabel.trim().slice(0, 80);
  if (!from || !to || from === to) return { updated: 0 };

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, tags")
    .contains("tags", [from])
    .limit(2000);

  let updated = 0;
  for (const p of profiles ?? []) {
    const tags = (p.tags ?? []).map((t: string) => (t === from ? to : t));
    const unique = [...new Set(tags)];
    const { error } = await admin.from("profiles").update({ tags: unique }).eq("id", p.id);
    if (!error) updated++;
  }
  return { updated };
}

export async function deleteTagCatalog(admin: SupabaseClient, id: string) {
  const { data: tag } = await admin.from("tag_catalog").select("label").eq("id", id).maybeSingle();
  const { error } = await admin.from("tag_catalog").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return tag?.label ?? null;
}
