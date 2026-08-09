import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import type {
  SalesPageRow,
  SalesPageSchema,
  SalesPageSeo,
  SalesPageStatus,
  SalesPageVersionRow,
} from "./types";
import { emptySalesPageSchema } from "./types";
import { normalizeSalesPageSchema, validateSalesPageForPublish } from "./schema";

const MAX_VERSIONS = 10;

function normalize(raw: unknown): SalesPageSchema {
  return normalizeSalesPageSchema(raw);
}

function normalizeSeo(raw: unknown): SalesPageSeo {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    description: typeof o.description === "string" ? o.description : undefined,
    canonicalUrl: typeof o.canonicalUrl === "string" ? o.canonicalUrl : undefined,
    ogTitle: typeof o.ogTitle === "string" ? o.ogTitle : undefined,
    ogDescription: typeof o.ogDescription === "string" ? o.ogDescription : undefined,
    ogImageAssetId: typeof o.ogImageAssetId === "string" ? o.ogImageAssetId : undefined,
    robots: o.robots === "noindex" || o.robots === "index" ? o.robots : undefined,
  };
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
): Promise<{ id: string; schema: SalesPageSchema; seo: SalesPageSeo; title: string } | null> {
  const { data } = await client
    .from("sales_pages")
    .select("id, title, status, published_schema, seo")
    .eq("course_id", courseId)
    .eq("status", "published")
    .maybeSingle();
  if (!data || !data.published_schema) return null;
  return {
    id: data.id,
    title: data.title,
    schema: normalize(data.published_schema),
    seo: normalizeSeo(data.seo),
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
  const seo = input.seo ? normalizeSeo(input.seo) : page.seo;
  const { data, error } = await admin
    .from("sales_pages")
    .update({
      title: input.title ?? page.title,
      draft_schema: draft_schema as never,
      seo: seo as never,
      draft_version: page.draft_version + 1,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", page.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save draft.");
  return mapRow(data);
}

async function pruneVersions(admin: SupabaseClient<Database>, salesPageId: string) {
  const { data: rows } = await admin
    .from("sales_page_versions")
    .select("id")
    .eq("sales_page_id", salesPageId)
    .order("created_at", { ascending: false });
  const extras = (rows ?? []).slice(MAX_VERSIONS);
  for (const row of extras) {
    await admin.from("sales_page_versions").delete().eq("id", row.id);
  }
}

export async function publishSalesPage(
  admin: SupabaseClient<Database>,
  courseId: string,
  adminUserId?: string | null,
): Promise<SalesPageRow> {
  const page = await getSalesPageByCourseId(admin, courseId);
  if (!page) throw new Error("Sales page not found.");
  const draft = normalize(page.draft_schema);
  const issues = validateSalesPageForPublish(draft);
  if (issues.length) {
    throw new Error(issues.map((i) => i.message).join(" "));
  }

  // Snapshot previous published page before overwrite (restore safety)
  if (page.published_schema && page.published_version > 0) {
    await admin.from("sales_page_versions").insert({
      sales_page_id: page.id,
      course_id: page.course_id,
      version: page.published_version,
      schema: page.published_schema as never,
      seo: page.seo as never,
      created_by: adminUserId ?? page.created_by,
    } as never);
    await pruneVersions(admin, page.id);
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

export async function listSalesPageVersions(
  admin: SupabaseClient<Database>,
  courseId: string,
): Promise<SalesPageVersionRow[]> {
  const page = await getSalesPageByCourseId(admin, courseId);
  if (!page) return [];
  const { data } = await admin
    .from("sales_page_versions")
    .select("*")
    .eq("sales_page_id", page.id)
    .order("created_at", { ascending: false })
    .limit(MAX_VERSIONS);
  return (data ?? []).map(mapVersionRow);
}

export async function restoreSalesPageVersion(
  admin: SupabaseClient<Database>,
  courseId: string,
  versionId: string,
): Promise<SalesPageRow> {
  const page = await getSalesPageByCourseId(admin, courseId);
  if (!page) throw new Error("Sales page not found.");
  const { data: ver } = await admin
    .from("sales_page_versions")
    .select("*")
    .eq("id", versionId)
    .eq("sales_page_id", page.id)
    .maybeSingle();
  if (!ver) throw new Error("Version not found.");
  return saveSalesPageDraft(admin, courseId, {
    schema: normalize(ver.schema),
    seo: normalizeSeo(ver.seo),
  });
}

export async function restoreFromPublished(
  admin: SupabaseClient<Database>,
  courseId: string,
): Promise<SalesPageRow> {
  const page = await getSalesPageByCourseId(admin, courseId);
  if (!page) throw new Error("Sales page not found.");
  if (!page.published_schema) throw new Error("No published version to restore.");
  return saveSalesPageDraft(admin, courseId, {
    schema: page.published_schema,
    seo: page.seo,
  });
}

function mapVersionRow(raw: Record<string, unknown>): SalesPageVersionRow {
  return {
    id: String(raw.id),
    sales_page_id: String(raw.sales_page_id),
    course_id: String(raw.course_id),
    version: Number(raw.version ?? 0),
    schema: normalize(raw.schema),
    seo: normalizeSeo(raw.seo),
    created_at: String(raw.created_at),
    created_by: (raw.created_by as string | null) ?? null,
  };
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
    seo: normalizeSeo(raw.seo),
    created_by: (raw.created_by as string | null) ?? null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
    published_at: (raw.published_at as string | null) ?? null,
  };
}
