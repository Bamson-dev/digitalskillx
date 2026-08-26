import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isMissingColumnError, isMissingRelationError } from "@/lib/schema-guard";
import { formatPostgrestError } from "@/lib/postgrest-error";

/** Default max simultaneous devices for students with paid program access. */
export const DEFAULT_PAID_MAX_DEVICES = 4;

export const DEVICE_KEY_COOKIE = "dsx_did";

export type DeviceLimitDecision =
  | { allowed: true; enforced: boolean; activeCount: number; maxDevices: number }
  | {
      allowed: false;
      enforced: true;
      activeCount: number;
      maxDevices: number;
      error: string;
    };

function normalizeMaxDevices(raw: number | null | undefined) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_PAID_MAX_DEVICES;
  return Math.min(50, Math.max(1, Math.round(raw)));
}

/** True when the student has paid / admin / link access (not free self-enroll only). */
export async function studentHasPaidProgramAccess(
  admin: SupabaseClient<Database>,
  studentId: string,
): Promise<boolean> {
  const { count: paidEnrollments, error: enrollError } = await admin
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("student_id", studentId)
    .neq("source", "self");
  if (enrollError) throw new Error(formatPostgrestError(enrollError));
  if ((paidEnrollments ?? 0) > 0) return true;

  const { count: paidTx, error: txError } = await admin
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("status", "success");
  if (txError) throw new Error(formatPostgrestError(txError));
  return (paidTx ?? 0) > 0;
}

export async function getStudentMaxDevices(
  admin: SupabaseClient<Database>,
  studentId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("profiles")
    .select("max_devices")
    .eq("id", studentId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error.message)) return DEFAULT_PAID_MAX_DEVICES;
    throw new Error(formatPostgrestError(error));
  }
  return normalizeMaxDevices(
    (data as { max_devices?: number | null } | null)?.max_devices ?? null,
  );
}

export async function countActiveDevices(
  admin: SupabaseClient<Database>,
  studentId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("account_sessions")
    .select("id, device_key")
    .eq("user_id", studentId)
    .is("revoked_at", null);
  if (error) {
    if (isMissingRelationError(error.message)) return 0;
    throw new Error(formatPostgrestError(error));
  }
  const rows = data ?? [];
  const keys = new Set<string>();
  for (const row of rows) {
    const key = (row as { device_key?: string | null }).device_key?.trim();
    keys.add(key || `id:${row.id}`);
  }
  return keys.size;
}

export async function deviceKeyAlreadyRegistered(
  admin: SupabaseClient<Database>,
  params: { studentId: string; deviceKey: string },
): Promise<boolean> {
  const { data, error } = await admin
    .from("account_sessions")
    .select("id")
    .eq("user_id", params.studentId)
    .eq("device_key", params.deviceKey)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message) || isMissingColumnError(error.message)) {
      return false;
    }
    throw new Error(formatPostgrestError(error));
  }
  return Boolean(data);
}

/**
 * Enforce paid-program device cap. Free-only students always pass.
 * Known devices can always re-login; new devices are blocked at the max.
 */
export async function assertDeviceLoginAllowed(
  admin: SupabaseClient<Database>,
  params: { studentId: string; deviceKey: string; role?: string | null },
): Promise<DeviceLimitDecision> {
  if (params.role === "admin") {
    return { allowed: true, enforced: false, activeCount: 0, maxDevices: DEFAULT_PAID_MAX_DEVICES };
  }

  let paid = false;
  try {
    paid = await studentHasPaidProgramAccess(admin, params.studentId);
  } catch (err) {
    console.error("[device-limit] paid check failed — allowing login:", err);
    return { allowed: true, enforced: false, activeCount: 0, maxDevices: DEFAULT_PAID_MAX_DEVICES };
  }

  if (!paid) {
    return { allowed: true, enforced: false, activeCount: 0, maxDevices: DEFAULT_PAID_MAX_DEVICES };
  }

  try {
    const maxDevices = await getStudentMaxDevices(admin, params.studentId);
    const known = await deviceKeyAlreadyRegistered(admin, {
      studentId: params.studentId,
      deviceKey: params.deviceKey,
    });
    if (known) {
      const activeCount = await countActiveDevices(admin, params.studentId);
      return { allowed: true, enforced: true, activeCount, maxDevices };
    }

    const activeCount = await countActiveDevices(admin, params.studentId);
    if (activeCount >= maxDevices) {
      return {
        allowed: false,
        enforced: true,
        activeCount,
        maxDevices,
        error: `This account is already signed in on ${activeCount} device${
          activeCount === 1 ? "" : "s"
        } (limit ${maxDevices}). Sign out another device from Account Security, or ask support to reset your devices.`,
      };
    }
    return { allowed: true, enforced: true, activeCount, maxDevices };
  } catch (err) {
    // Missing migration should not lock paying students out.
    console.error("[device-limit] enforcement failed — allowing login:", err);
    return { allowed: true, enforced: false, activeCount: 0, maxDevices: DEFAULT_PAID_MAX_DEVICES };
  }
}

export function readDeviceKeyFromRequest(request: {
  cookies: { get: (name: string) => { value: string } | undefined };
  headers: { get: (name: string) => string | null };
}): string | null {
  const fromCookie = request.cookies.get(DEVICE_KEY_COOKIE)?.value?.trim();
  if (fromCookie && /^[a-zA-Z0-9_-]{8,128}$/.test(fromCookie)) return fromCookie;
  const fromHeader = request.headers.get("x-dsx-device-key")?.trim();
  if (fromHeader && /^[a-zA-Z0-9_-]{8,128}$/.test(fromHeader)) return fromHeader;
  return null;
}

export function newDeviceKey() {
  return crypto.randomUUID().replace(/-/g, "");
}
