import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { ensurePurchaseEnrollment } from "@/lib/purchase";
import { secureLog, secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Issue = {
  code: string;
  severity: "critical" | "high" | "medium";
  count: number;
  sampleIds: string[];
  repaired?: number;
  truncated?: boolean;
};

/** Cap full-row scans — integrity is sampled + repair-focused, not a warehouse dump. */
const ENROLLMENT_SCAN_LIMIT = 5_000;
const SUCCESS_TX_SCAN_LIMIT = 2_000;

/**
 * Production DB integrity audit (and optional safe repairs).
 * Auth: Authorization: Bearer $CRON_SECRET
 * Query: ?repair=1 to auto-repair safe inconsistencies (paid success without enrollment).
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();
  const repair = request.nextUrl.searchParams.get("repair") === "1";
  const issues: Issue[] = [];

  const { data: enrollments, error: enrollErr } = await admin
    .from("enrollments")
    .select("id, student_id, course_id")
    .order("enrolled_at", { ascending: false })
    .limit(ENROLLMENT_SCAN_LIMIT);

  if (enrollErr) {
    secureLogError("integrity", ErrorCode.DATABASE_QUERY_FAILED, "enrollments scan failed", {
      error: enrollErr.message,
    });
  }

  const enrollKey = new Map<string, string[]>();
  for (const row of enrollments ?? []) {
    const key = `${row.student_id}:${row.course_id}`;
    const list = enrollKey.get(key) ?? [];
    list.push(row.id);
    enrollKey.set(key, list);
  }
  const dupEnroll = [...enrollKey.entries()].filter(([, ids]) => ids.length > 1);
  if (dupEnroll.length) {
    issues.push({
      code: "duplicate_enrollments",
      severity: "critical",
      count: dupEnroll.length,
      sampleIds: dupEnroll.slice(0, 10).flatMap(([, ids]) => ids),
      truncated: (enrollments ?? []).length >= ENROLLMENT_SCAN_LIMIT,
    });
  }

  const { data: txs, error: txErr } = await admin
    .from("transactions")
    .select("id, reference, student_id, course_id, status, created_at")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(SUCCESS_TX_SCAN_LIMIT);

  if (txErr) {
    secureLogError("integrity", ErrorCode.DATABASE_QUERY_FAILED, "transactions scan failed", {
      error: txErr.message,
    });
  }

  const successWithoutEnrollment: string[] = [];
  let repaired = 0;
  for (const tx of txs ?? []) {
    if (!tx.student_id) {
      successWithoutEnrollment.push(tx.id);
      continue;
    }
    // Digital-only purchases have no course_id — enrollment check does not apply.
    if (!tx.course_id) {
      continue;
    }
    const { data: enr } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", tx.student_id)
      .eq("course_id", tx.course_id)
      .maybeSingle();
    if (!enr) {
      successWithoutEnrollment.push(tx.id);
      if (repair) {
        try {
          await ensurePurchaseEnrollment({
            studentId: tx.student_id,
            courseId: tx.course_id,
          });
          repaired++;
        } catch (err) {
          secureLogError("integrity", ErrorCode.ENROLLMENT_FAILED, "repair enrollment failed", {
            txId: tx.id,
            reference: tx.reference,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }
  if (successWithoutEnrollment.length) {
    issues.push({
      code: "success_without_enrollment",
      severity: "critical",
      count: successWithoutEnrollment.length,
      sampleIds: successWithoutEnrollment.slice(0, 20),
      repaired: repair ? repaired : undefined,
      truncated: (txs ?? []).length >= SUCCESS_TX_SCAN_LIMIT,
    });
  }

  const { data: pendingOld } = await admin
    .from("transactions")
    .select("id, reference, created_at")
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(50);
  if ((pendingOld ?? []).length) {
    issues.push({
      code: "stale_pending_transactions",
      severity: "medium",
      count: (pendingOld ?? []).length,
      sampleIds: (pendingOld ?? []).map((t) => t.id),
    });
  }

  const studentIds = [...new Set((enrollments ?? []).map((e) => e.student_id))];
  const profileIds = new Set<string>();
  for (let i = 0; i < studentIds.length; i += 200) {
    const slice = studentIds.slice(i, i + 200);
    const { data: profiles } = await admin.from("profiles").select("id").in("id", slice);
    for (const p of profiles ?? []) profileIds.add(p.id);
  }
  const orphanEnrollmentIds = (enrollments ?? [])
    .filter((e) => !profileIds.has(e.student_id))
    .map((e) => e.id);
  if (orphanEnrollmentIds.length) {
    issues.push({
      code: "orphan_enrollments",
      severity: "high",
      count: orphanEnrollmentIds.length,
      sampleIds: orphanEnrollmentIds.slice(0, 20),
      truncated: (enrollments ?? []).length >= ENROLLMENT_SCAN_LIMIT,
    });
  }

  secureLog("info", "integrity", "audit complete", {
    issueCount: issues.length,
    repair,
    repaired,
    enrollmentSample: (enrollments ?? []).length,
    txSample: (txs ?? []).length,
  });

  const critical = issues.filter((i) => i.severity === "critical").length;
  return NextResponse.json({
    ok: critical === 0,
    repaired: repair ? repaired : 0,
    issues,
    scanLimits: {
      enrollments: ENROLLMENT_SCAN_LIMIT,
      successTransactions: SUCCESS_TX_SCAN_LIMIT,
    },
    checkedAt: new Date().toISOString(),
  });
}
