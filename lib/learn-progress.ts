import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isMissingRelationError, isMissingColumnError } from "@/lib/schema-guard";
import { summarizeLearnCompletion } from "@/lib/content-factory/library-shared";

type Admin = SupabaseClient<Database>;

export const LEARN_DEVICE_COOKIE = "dsx_learn_device";

export function createLearnDeviceKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function readLearnDeviceKeyFromCookieStore(): string | null {
  try {
    const value = cookies().get(LEARN_DEVICE_COOKIE)?.value?.trim();
    if (value && value.length >= 8 && value.length <= 128) return value;
  } catch {
    /* non-request context */
  }
  return null;
}

/** Map lesson display numbers ("1","2") to lesson UUIDs by curriculum position. */
export async function mapLessonNumbersToIds(
  admin: Admin,
  pathId: string,
  lessonNumbers: string[],
): Promise<string[]> {
  const { data, error } = await admin
    .from("learning_path_lessons")
    .select("id, position")
    .eq("learning_path_id", pathId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  const ordered = data ?? [];
  const ids: string[] = [];
  for (const key of lessonNumbers) {
    const n = Number(key);
    if (!Number.isFinite(n) || n < 1) continue;
    const row = ordered[n - 1];
    if (row?.id) ids.push(row.id);
  }
  return ids;
}

export async function listRequiredLessonIds(admin: Admin, pathId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("learning_path_lessons")
    .select("id")
    .eq("learning_path_id", pathId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id);
}

export async function upsertLearnProgress(params: {
  admin: Admin;
  pathId: string;
  lessonIds: string[];
  studentId?: string | null;
  deviceKey?: string | null;
  completed: boolean;
}) {
  const { admin, pathId, lessonIds, completed } = params;
  const studentId = params.studentId ?? null;
  const deviceKey = params.deviceKey ?? null;
  if (!studentId && (!deviceKey || deviceKey.length < 8)) {
    throw new Error("Progress owner required.");
  }

  if (!completed) {
    let q = admin.from("learning_path_progress").delete().eq("learning_path_id", pathId).in("lesson_id", lessonIds);
    if (studentId) q = q.eq("student_id", studentId);
    else q = q.eq("device_key", deviceKey!).is("student_id", null);
    const { error } = await q;
    if (error && !isMissingRelationError(error.message) && !isMissingColumnError(error.message)) {
      throw new Error(error.message);
    }
    return;
  }

  const now = new Date().toISOString();
  const rows = lessonIds.map((lessonId) => ({
    learning_path_id: pathId,
    lesson_id: lessonId,
    student_id: studentId,
    device_key: studentId ? null : deviceKey,
    completed_at: now,
    updated_at: now,
  }));

  const { error } = await admin.from("learning_path_progress").upsert(rows as never, {
    onConflict: studentId ? "student_id,lesson_id" : "device_key,lesson_id",
    ignoreDuplicates: false,
  });
  if (error && !isMissingRelationError(error.message) && !isMissingColumnError(error.message)) {
    // Unique partial indexes may not map to onConflict — fall back to insert-ignore loop.
    for (const row of rows) {
      const insert = await admin.from("learning_path_progress").insert(row as never);
      if (insert.error && !/duplicate|unique/i.test(insert.error.message)) {
        if (isMissingRelationError(insert.error.message) || isMissingColumnError(insert.error.message)) {
          return;
        }
        throw new Error(insert.error.message);
      }
    }
  }
}

export async function loadLearnProgressSummary(params: {
  admin: Admin;
  pathId: string;
  studentId?: string | null;
  deviceKey?: string | null;
}) {
  const required = await listRequiredLessonIds(params.admin, params.pathId);
  const progressMap: Record<string, boolean> = {};

  let query = params.admin
    .from("learning_path_progress")
    .select("lesson_id")
    .eq("learning_path_id", params.pathId);
  if (params.studentId) query = query.eq("student_id", params.studentId);
  else if (params.deviceKey) query = query.eq("device_key", params.deviceKey).is("student_id", null);
  else return summarizeLearnCompletion({}, required);

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message) || isMissingColumnError(error.message)) {
      return summarizeLearnCompletion({}, required);
    }
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    progressMap[row.lesson_id] = true;
  }
  return summarizeLearnCompletion(progressMap, required);
}

export async function assertLearningPathFullyComplete(params: {
  admin: Admin;
  pathId: string;
  studentId?: string | null;
  deviceKey?: string | null;
  /** Lesson display numbers from localStorage (1-based), used when server rows are missing. */
  clientLessonNumbers?: string[];
}): Promise<{ ok: true; summary: ReturnType<typeof summarizeLearnCompletion> } | { ok: false; error: string }> {
  const required = await listRequiredLessonIds(params.admin, params.pathId);
  if (!required.length) {
    return { ok: false, error: "This learning path has no lessons yet." };
  }

  let summary = await loadLearnProgressSummary({
    admin: params.admin,
    pathId: params.pathId,
    studentId: params.studentId,
    deviceKey: params.deviceKey,
  });

  // Hydrate from client lesson numbers when server table empty / not migrated yet.
  if (!summary.isComplete && params.clientLessonNumbers?.length) {
    const mapped = await mapLessonNumbersToIds(
      params.admin,
      params.pathId,
      params.clientLessonNumbers.filter(Boolean),
    );
    if (mapped.length) {
      try {
        await upsertLearnProgress({
          admin: params.admin,
          pathId: params.pathId,
          lessonIds: mapped,
          studentId: params.studentId,
          deviceKey: params.deviceKey,
          completed: true,
        });
      } catch {
        /* table may be missing — still evaluate client claim carefully */
      }
      const fromClient: Record<string, boolean> = {};
      for (const id of mapped) fromClient[id] = true;
      const clientSummary = summarizeLearnCompletion(fromClient, required);
      if (clientSummary.isComplete) summary = clientSummary;
      else summary = await loadLearnProgressSummary({
        admin: params.admin,
        pathId: params.pathId,
        studentId: params.studentId,
        deviceKey: params.deviceKey,
      });
    }
  }

  if (!summary.isComplete) {
    return {
      ok: false,
      error: `Complete all ${summary.total} lessons before getting a certificate (${summary.completed}/${summary.total} done).`,
    };
  }
  return { ok: true, summary };
}
