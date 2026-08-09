import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  evaluateSegment,
  normalizeSegmentDefinition,
  type SegmentDefinition,
  type SegmentEvalCtx,
} from "@/lib/customer-segments-rules";

export type {
  SegmentDefinition,
  SegmentRule,
  SegmentRuleField,
} from "@/lib/customer-segments-rules";
export { evaluateSegment, normalizeSegmentDefinition } from "@/lib/customer-segments-rules";

function koboToNaira(n: number) {
  return (Number(n) || 0) / 100;
}

/** Evaluate a segment against a bounded student sample (max 500 profiles). */
export async function listSegmentMembers(
  admin: SupabaseClient,
  definition: SegmentDefinition,
  limit = 100,
): Promise<Array<{ id: string; full_name: string | null; email: string }>> {
  const def = normalizeSegmentDefinition(definition);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email, tags, last_active_at")
    .eq("role", "student")
    .eq("is_suspended", false)
    .order("created_at", { ascending: false })
    .limit(500);

  const ids = (profiles ?? []).map((p) => p.id);
  if (!ids.length) return [];

  const [{ data: txs }, { data: enr }, { data: certs }] = await Promise.all([
    admin
      .from("transactions")
      .select("student_id, amount, course_id, status")
      .in("student_id", ids)
      .eq("status", "success"),
    admin.from("enrollments").select("student_id, course_id, completed_at").in("student_id", ids),
    admin.from("certificates").select("student_id").in("student_id", ids).eq("is_valid", true),
  ]);

  const spent = new Map<string, number>();
  const purchases = new Map<string, number>();
  const purchasedCourses = new Map<string, Set<string>>();
  for (const t of txs ?? []) {
    if (!t.student_id) continue;
    spent.set(t.student_id, (spent.get(t.student_id) ?? 0) + koboToNaira(t.amount));
    purchases.set(t.student_id, (purchases.get(t.student_id) ?? 0) + 1);
    const set = purchasedCourses.get(t.student_id) ?? new Set();
    if (t.course_id) set.add(t.course_id);
    purchasedCourses.set(t.student_id, set);
  }

  const enrolled = new Map<string, Set<string>>();
  const completed = new Map<string, Set<string>>();
  for (const e of enr ?? []) {
    const es = enrolled.get(e.student_id) ?? new Set();
    es.add(e.course_id);
    enrolled.set(e.student_id, es);
    if (e.completed_at) {
      const cs = completed.get(e.student_id) ?? new Set();
      cs.add(e.course_id);
      completed.set(e.student_id, cs);
    }
  }

  const certSet = new Set((certs ?? []).map((c) => c.student_id));

  const matches: Array<{ id: string; full_name: string | null; email: string }> = [];
  for (const p of profiles ?? []) {
    const ctx: SegmentEvalCtx = {
      purchaseCount: purchases.get(p.id) ?? 0,
      totalSpentNgn: spent.get(p.id) ?? 0,
      tags: p.tags ?? [],
      lastActiveAt: p.last_active_at,
      enrolledCourseIds: enrolled.get(p.id) ?? new Set(),
      completedCourseIds: completed.get(p.id) ?? new Set(),
      purchasedCourseIds: purchasedCourses.get(p.id) ?? new Set(),
      hasCertificate: certSet.has(p.id),
    };
    if (evaluateSegment(def, ctx)) {
      matches.push({ id: p.id, full_name: p.full_name, email: p.email });
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export async function listSegments(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("customer_segments")
    .select("id, name, description, definition, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function saveSegment(
  admin: SupabaseClient,
  input: {
    id?: string;
    name: string;
    description?: string;
    definition: SegmentDefinition;
    createdBy?: string | null;
  },
) {
  const payload = {
    name: input.name.trim().slice(0, 120),
    description: input.description?.trim().slice(0, 500) || null,
    definition: normalizeSegmentDefinition(input.definition),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await admin
      .from("customer_segments")
      .update(payload)
      .eq("id", input.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await admin
    .from("customer_segments")
    .insert({ ...payload, created_by: input.createdBy ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSegment(admin: SupabaseClient, id: string) {
  const { error } = await admin.from("customer_segments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
