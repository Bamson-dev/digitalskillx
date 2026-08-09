import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/org";
import { recordEnrollmentEvent } from "@/lib/enrollment-links/events";
import {
  enrollmentLinkTokenPrefix,
  generateEnrollmentLinkToken,
  hashEnrollmentLinkToken,
} from "@/lib/enrollment-links/token";
import type {
  Database,
  EnrollmentLink,
  EnrollmentLinkAccess,
  EnrollmentLinkRedirect,
  EnrollmentLinkStatus,
} from "@/types/database";

export type CreateEnrollmentLinkInput = {
  name: string;
  description?: string;
  courseIds: string[];
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  status?: EnrollmentLinkStatus;
  accessType?: EnrollmentLinkAccess;
  redirectType?: EnrollmentLinkRedirect;
  redirectCourseId?: string | null;
  createdBy: string;
};

export type UpdateEnrollmentLinkInput = {
  name?: string;
  description?: string;
  courseIds?: string[];
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  status?: EnrollmentLinkStatus;
  accessType?: EnrollmentLinkAccess;
  redirectType?: EnrollmentLinkRedirect;
  redirectCourseId?: string | null;
};

function publicEnrollUrl(plaintextToken: string) {
  return `${siteUrl()}/enroll/${encodeURIComponent(plaintextToken)}`;
}

async function replaceCourses(
  admin: SupabaseClient<Database>,
  linkId: string,
  courseIds: string[],
) {
  const unique = [...new Set(courseIds.filter(Boolean))];
  if (unique.length === 0) throw new Error("Select at least one course.");

  await admin.from("enrollment_link_courses").delete().eq("enrollment_link_id", linkId);
  const { error } = await admin.from("enrollment_link_courses").insert(
    unique.map((course_id) => ({ enrollment_link_id: linkId, course_id })),
  );
  if (error) throw new Error(error.message);
}

export async function createEnrollmentLink(
  admin: SupabaseClient<Database>,
  input: CreateEnrollmentLinkInput,
) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Link name is required.");
  if (!input.courseIds?.length) throw new Error("Select at least one course.");

  const plaintext = generateEnrollmentLinkToken();
  const tokenHash = hashEnrollmentLinkToken(plaintext);
  const tokenPrefix = enrollmentLinkTokenPrefix(plaintext);

  const { data: link, error } = await admin
    .from("enrollment_links")
    .insert({
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      name,
      description: (input.description ?? "").trim(),
      status: input.status ?? "active",
      access_type: input.accessType ?? "public",
      max_redemptions: input.maxRedemptions ?? null,
      expires_at: input.expiresAt ?? null,
      redirect_type: input.redirectType ?? "success_page",
      redirect_course_id: input.redirectCourseId ?? null,
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await replaceCourses(admin, link.id, input.courseIds);
  await recordEnrollmentEvent(admin, {
    event: "link_created",
    enrollmentLinkId: link.id,
    userId: input.createdBy,
    metadata: { name, courseCount: input.courseIds.length },
  });

  return {
    link: link as EnrollmentLink,
    plaintextToken: plaintext,
    url: publicEnrollUrl(plaintext),
  };
}

export async function updateEnrollmentLink(
  admin: SupabaseClient<Database>,
  linkId: string,
  input: UpdateEnrollmentLinkInput,
  adminUserId: string,
) {
  const patch: Database["public"]["Tables"]["enrollment_links"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (input.name != null) patch.name = input.name.trim();
  if (input.description != null) patch.description = input.description.trim();
  if (input.maxRedemptions !== undefined) patch.max_redemptions = input.maxRedemptions;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
  if (input.status != null) patch.status = input.status;
  if (input.accessType != null) patch.access_type = input.accessType;
  if (input.redirectType != null) patch.redirect_type = input.redirectType;
  if (input.redirectCourseId !== undefined) patch.redirect_course_id = input.redirectCourseId;

  const { data: link, error } = await admin
    .from("enrollment_links")
    .update(patch)
    .eq("id", linkId)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (input.courseIds) {
    await replaceCourses(admin, linkId, input.courseIds);
  }

  await recordEnrollmentEvent(admin, {
    event: "link_updated",
    enrollmentLinkId: linkId,
    userId: adminUserId,
    metadata: patch as never,
  });

  return link as EnrollmentLink;
}

export async function softDeleteEnrollmentLink(
  admin: SupabaseClient<Database>,
  linkId: string,
  adminUserId: string,
) {
  const { error } = await admin
    .from("enrollment_links")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", linkId);
  if (error) throw new Error(error.message);
  await recordEnrollmentEvent(admin, {
    event: "link_deleted",
    enrollmentLinkId: linkId,
    userId: adminUserId,
  });
}

/** Soft-delete many enrollment links in one update (skips already-deleted). */
export async function softDeleteEnrollmentLinks(
  admin: SupabaseClient<Database>,
  linkIds: string[],
  adminUserId: string,
): Promise<{ deleted: number }> {
  const ids = [...new Set(linkIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { deleted: 0 };
  if (ids.length > 500) {
    throw new Error("You can delete at most 500 enrollment links at a time.");
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("enrollment_links")
    .update({
      status: "deleted",
      deleted_at: now,
      updated_at: now,
    })
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(error.message);

  const deletedIds = (data ?? []).map((row) => row.id);
  for (const linkId of deletedIds) {
    await recordEnrollmentEvent(admin, {
      event: "link_deleted",
      enrollmentLinkId: linkId,
      userId: adminUserId,
      metadata: { bulk: true },
    });
  }

  return { deleted: deletedIds.length };
}

export async function setEnrollmentLinkEnabled(
  admin: SupabaseClient<Database>,
  linkId: string,
  enabled: boolean,
  adminUserId: string,
) {
  const status: EnrollmentLinkStatus = enabled ? "active" : "disabled";
  const { error } = await admin
    .from("enrollment_links")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", linkId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  await recordEnrollmentEvent(admin, {
    event: enabled ? "link_enabled" : "link_disabled",
    enrollmentLinkId: linkId,
    userId: adminUserId,
  });
}

export async function duplicateEnrollmentLink(
  admin: SupabaseClient<Database>,
  linkId: string,
  adminUserId: string,
) {
  const { data: source, error } = await admin
    .from("enrollment_links")
    .select("*")
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!source || source.deleted_at) throw new Error("Link not found.");

  const { data: courses } = await admin
    .from("enrollment_link_courses")
    .select("course_id")
    .eq("enrollment_link_id", linkId);

  return createEnrollmentLink(admin, {
    name: `${source.name} (copy)`,
    description: source.description,
    courseIds: (courses ?? []).map((c) => c.course_id),
    maxRedemptions: source.max_redemptions,
    expiresAt: source.expires_at,
    status: "active",
    accessType: source.access_type,
    redirectType: source.redirect_type,
    redirectCourseId: source.redirect_course_id,
    createdBy: adminUserId,
  });
}

/**
 * Rotate the public invite token and return the new shareable URL.
 * Needed because plaintext tokens are not stored after create.
 */
export async function regenerateEnrollmentLinkToken(
  admin: SupabaseClient<Database>,
  linkId: string,
  adminUserId: string,
) {
  const { data: existing, error: loadError } = await admin
    .from("enrollment_links")
    .select("id, deleted_at")
    .eq("id", linkId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing || existing.deleted_at) throw new Error("Link not found.");

  const plaintext = generateEnrollmentLinkToken();
  const tokenHash = hashEnrollmentLinkToken(plaintext);
  const tokenPrefix = enrollmentLinkTokenPrefix(plaintext);

  const { data: link, error } = await admin
    .from("enrollment_links")
    .update({
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      updated_at: new Date().toISOString(),
    })
    .eq("id", linkId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await recordEnrollmentEvent(admin, {
    event: "link_token_regenerated",
    enrollmentLinkId: linkId,
    userId: adminUserId,
  });

  return {
    link: link as EnrollmentLink,
    plaintextToken: plaintext,
    url: publicEnrollUrl(plaintext),
  };
}

export async function listEnrollmentLinks(
  admin: SupabaseClient<Database>,
  filters?: {
    search?: string;
    status?: EnrollmentLinkStatus | "all";
    accessType?: EnrollmentLinkAccess | "all";
    sort?: "newest" | "oldest" | "most_redeemed" | "expiring_soon";
  },
) {
  let query = admin
    .from("enrollment_links")
    .select("*, enrollment_link_courses(course_id)")
    .is("deleted_at", null);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.accessType && filters.accessType !== "all") {
    query = query.eq("access_type", filters.accessType);
  }
  if (filters?.search?.trim()) {
    query = query.ilike("name", `%${filters.search.trim()}%`);
  }

  switch (filters?.sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "most_redeemed":
      query = query.order("current_redemptions", { ascending: false });
      break;
    case "expiring_soon":
      query = query.order("expires_at", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEnrollmentLinkById(
  admin: SupabaseClient<Database>,
  linkId: string,
) {
  const { data: link, error } = await admin
    .from("enrollment_links")
    .select("*")
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!link) return null;

  const { data: courses } = await admin
    .from("enrollment_link_courses")
    .select("course_id, courses(id, title, thumbnail_url, visibility, price_ngn, category_id)")
    .eq("enrollment_link_id", linkId);

  const { data: redemptions } = await admin
    .from("enrollment_link_redemptions")
    .select("*")
    .eq("enrollment_link_id", linkId)
    .order("redeemed_at", { ascending: false })
    .limit(100);

  return { link: link as EnrollmentLink, courses: courses ?? [], redemptions: redemptions ?? [] };
}
