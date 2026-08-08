import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import type { SalesPageRow, SalesPageSchema, SalesPageSeo, SalesPageStatus } from "./types";
import { emptySalesPageSchema } from "./types";
import { normalizeSalesPageSchema } from "./schema";

function normalize(raw: unknown): SalesPageSchema {
  return normalizeSalesPageSchema(raw);
}

export async function getOrCreateSalesPage(
  admin: SupabaseClient<Database>,
  courseId: string,
  adminUserId: string,
): Promise<SalesPageRow> {
  const { data: existing } = await admin
    .from("sales_pages")
    .select("*")
    .eq("course_id", courseId)
    .maybeSingle();
  if (existing) return mapRow(existing);

  const { data, error } = await admin
    .from("sales_pages")
    .insert({
      course_id: courseId,
      title: "Sales page",
      status: "draft",
      draft_schema: emptySalesPageSchema() as never,
      created_by: adminUserId,
    } as never)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create sales page.");
  return mapRow(data);
}

export async function getSalesPageByCourseId(
  admin: SupabaseClient<Database>,
  courseId: string,
): Promise<SalesPageRow | null> {
  const { data } = await admin.from("sales_pages").select("*").eq("course_id", courseId).maybeSingle();
  return data ? mapRow(data) : null;
}

/** Public landing: only published schema. */
export async function getPublishedSalesPageForCourse(
  client: SupabaseClient<Database>,
  courseId: string,
): Promise<{ schema: SalesPageSchema; seo: SalesPageSeo; title: string } | null> {
  const { data } = await client
    .from("sales_pages")
    .select("title, status, published_schema, seo")
    .eq("course_id", courseId)
    .eq("status", "published")
    .maybeSingle();
  if (!data || !data.published_schema) return null;
  return {
    title: data.title,
    schema: normalize(data.published_schema),
    seo: (data.seo ?? {}) as SalesPageSeo,
  };
}

export async function saveSalesPageDraft(
  admin: SupabaseClient<Database>,
  courseId: string,
  input: { title?: string; schema?: SalesPageSchema; seo?: SalesPageSeo },
): Promise<SalesPageRow> {
  const page = await getSalesPageByCourseId(admin, courseId);
  if (!page) throw new Error("Sales page not found.");
  const draft_schema = input.schema ? normalize(input.schema) : page.draft_schema;
  const { data, error } = await admin
    .from("sales_pages")
    .update({
      title: input.title ?? page.title,
      draft_schema: draft_schema as never,
      seo: (input.seo ?? page.seo) as never,
      draft_version: page.draft_version + 1,
      updated_at: new Date().toISOString(),
      // Keep published_schema untouched while editing draft
    } as never)
    .eq("id", page.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save draft.");
  return mapRow(data);
}

export async function publishSalesPage(
  admin: SupabaseClient<Database>,
  courseId: string,
): Promise<SalesPageRow> {
  const page = await getSalesPageByCourseId(admin, courseId);
  if (!page) throw new Error("Sales page not found.");
  const draft = normalize(page.draft_schema);
  if (!draft.sections.length) {
    throw new Error("Cannot publish an empty sales page. Import or add sections first.");
  }
  if (!draft.sections.some((s) => s.type === "cta")) {
    throw new Error("Cannot publish without a DigitalSkillX purchase CTA.");
  }
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("sales_pages")
    .update({
      status: "published" satisfies SalesPageStatus,
      published_schema: draft as never,
      published_version: page.draft_version,
      published_at: now,
      updated_at: now,
    } as never)
    .eq("id", page.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not publish sales page.");
  return mapRow(data);
}

export async function unpublishSalesPage(
  admin: SupabaseClient<Database>,
  courseId: string,
): Promise<SalesPageRow> {
  const page = await getSalesPageByCourseId(admin, courseId);
  if (!page) throw new Error("Sales page not found.");
  const { data, error } = await admin
    .from("sales_pages")
    .update({
      status: "unpublished" satisfies SalesPageStatus,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", page.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not unpublish sales page.");
  return mapRow(data);
}

function mapRow(raw: Record<string, unknown>): SalesPageRow {
  return {
    id: String(raw.id),
    course_id: String(raw.course_id),
    title: String(raw.title ?? ""),
    status: raw.status as SalesPageRow["status"],
    draft_schema: normalize(raw.draft_schema),
    published_schema: raw.published_schema ? normalize(raw.published_schema) : null,
    draft_version: Number(raw.draft_version ?? 1),
    published_version: Number(raw.published_version ?? 0),
    seo: (raw.seo ?? {}) as SalesPageSeo,
    created_by: (raw.created_by as string | null) ?? null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
    published_at: (raw.published_at as string | null) ?? null,
  };
}
