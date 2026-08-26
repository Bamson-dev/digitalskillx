import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  assertDeviceLoginAllowed,
  countActiveDevices,
  getStudentMaxDevices,
  studentHasPaidProgramAccess,
} from "@/lib/device-login-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Self-test for paid device limits. Auth: Bearer CRON_SECRET.
 * Seeds disposable sessions, asserts allow/deny, then deletes them.
 */
export async function POST(request: NextRequest) {
  const cron = verifyCronSecret(request);
  if (!cron.ok) {
    return NextResponse.json({ error: cron.error }, { status: cron.status });
  }

  const admin = await createAdminClientAsync();
  const marker = `dsx-selftest-${Date.now()}`;
  const insertedIds: string[] = [];

  try {
    const { data: paidCourse, error: courseError } = await admin
      .from("courses")
      .select("id, title, price_ngn, price_usd")
      .or("price_ngn.gt.0,price_usd.gt.0")
      .limit(1)
      .maybeSingle();
    if (courseError) throw new Error(courseError.message);
    if (!paidCourse) {
      return NextResponse.json({ ok: false, error: "No paid course found." }, { status: 404 });
    }

    const { data: enrollment } = await admin
      .from("enrollments")
      .select("student_id")
      .eq("course_id", paidCourse.id)
      .limit(1)
      .maybeSingle();

    if (!enrollment?.student_id) {
      return NextResponse.json(
        { ok: false, error: "No student enrolled in a paid course to self-test." },
        { status: 404 },
      );
    }

    const studentId = enrollment.student_id;
    const paid = await studentHasPaidProgramAccess(admin, studentId);
    const maxDevices = await getStudentMaxDevices(admin, studentId);

    if (!paid) {
      return NextResponse.json({
        ok: false,
        error: "Selected student unexpectedly not classified as paid.",
        studentId,
        courseId: paidCourse.id,
      });
    }

    // Snapshot existing count so we only assert relative to seeded rows.
    const before = await countActiveDevices(admin, studentId);

    for (let i = 1; i <= maxDevices; i++) {
      const { data, error } = await admin
        .from("account_sessions")
        .insert({
          user_id: studentId,
          session_token_hash: `${marker}-tok-${i}-${Math.random().toString(36).slice(2)}`,
          device_key: `${marker}-dev-${i}`,
          browser: "Chrome",
          os: "SelfTest",
          device: "desktop",
          is_current: false,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "insert failed");
      insertedIds.push(data.id);
    }

    const afterSeed = await countActiveDevices(admin, studentId);
    const known = await assertDeviceLoginAllowed(admin, {
      studentId,
      deviceKey: `${marker}-dev-1`,
      role: "student",
    });
    const blocked = await assertDeviceLoginAllowed(admin, {
      studentId,
      deviceKey: `${marker}-new-device`,
      role: "student",
    });

    // Free path probe: pick a student with only free courses if any.
    let freeProbe: { studentId: string; allowed: boolean } | null = null;
    const { data: freeCourse } = await admin
      .from("courses")
      .select("id")
      .eq("price_ngn", 0)
      .eq("price_usd", 0)
      .limit(1)
      .maybeSingle();
    if (freeCourse?.id) {
      const { data: freeEnroll } = await admin
        .from("enrollments")
        .select("student_id")
        .eq("course_id", freeCourse.id)
        .limit(5);
      for (const row of freeEnroll ?? []) {
        const isPaid = await studentHasPaidProgramAccess(admin, row.student_id);
        if (!isPaid) {
          const decision = await assertDeviceLoginAllowed(admin, {
            studentId: row.student_id,
            deviceKey: `${marker}-free-device`,
            role: "student",
          });
          freeProbe = { studentId: row.student_id, allowed: decision.allowed };
          break;
        }
      }
    }

    const ok =
      known.allowed === true &&
      blocked.allowed === false &&
      afterSeed >= before + maxDevices &&
      (freeProbe ? freeProbe.allowed === true : true);

    return NextResponse.json({
      ok,
      studentId,
      paidCourseId: paidCourse.id,
      maxDevices,
      before,
      afterSeed,
      knownAllowed: known.allowed,
      blockedAllowed: blocked.allowed,
      blockedError: blocked.allowed ? null : blocked.error,
      freeProbe,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    if (insertedIds.length > 0) {
      await admin.from("account_sessions").delete().in("id", insertedIds);
    }
  }
}
