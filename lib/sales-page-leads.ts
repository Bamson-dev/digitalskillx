import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";
import { isValidStudentEmail } from "@/lib/admin-student-onboarding";

export type UpsertSalesPageLeadInput = {
  courseId: string;
  salesPageId?: string | null;
  email: string;
  fullName?: string | null;
  consent: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Upsert lead by (course_id, email). Never duplicates contacts for the same course.
 */
export async function upsertSalesPageLead(
  admin: SupabaseClient,
  input: UpsertSalesPageLeadInput,
): Promise<{ ok: true; id: string; created: boolean } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!isValidStudentEmail(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!input.consent) {
    return { ok: false, error: "Consent is required." };
  }

  const fullName = input.fullName?.trim().slice(0, 120) || null;
  const metadata = sanitizeLeadMetadata(input.metadata ?? {});

  const { data: existing } = await admin
    .from("sales_page_leads")
    .select("id")
    .eq("course_id", input.courseId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("sales_page_leads")
      .update({
        full_name: fullName ?? undefined,
        consent: true,
        sales_page_id: input.salesPageId ?? undefined,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) {
      if (isMissingRelationError(error.message)) {
        return { ok: false, error: "Lead capture is not available yet." };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, id: existing.id, created: false };
  }

  const { data, error } = await admin
    .from("sales_page_leads")
    .insert({
      course_id: input.courseId,
      sales_page_id: input.salesPageId ?? null,
      email,
      full_name: fullName,
      consent: true,
      source: "sales_page",
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return { ok: false, error: "Lead capture is not available yet." };
    }
    // race on unique → treat as update
    if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
      const { data: again } = await admin
        .from("sales_page_leads")
        .select("id")
        .eq("course_id", input.courseId)
        .eq("email", email)
        .maybeSingle();
      if (again) return { ok: true, id: again.id, created: false };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data.id, created: true };
}

const BLOCKED_LEAD_META = /^(password|token|secret|card|cvv|cvc|authorization|cookie|ssn)$/i;

function sanitizeLeadMetadata(
  raw: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || key.length > 64 || BLOCKED_LEAD_META.test(key)) continue;
    if (value === null || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (typeof value === "string") out[key] = value.slice(0, 500);
  }
  return out;
}
