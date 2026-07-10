import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutomations } from "@/lib/automation";
import {
  buildCourseResolver,
  ensureImportedStudentProfile,
  findProfileByEmail,
  generateStrongPassword,
  grantCourseAccessToStudent,
  isValidStudentEmail,
  parseStudentCsv,
  resolveCanonicalStudentId,
  resolveStudentIdByEmail,
  sendStudentWelcomeEmail,
  verifyStudentCourseAccess,
  waitForStudentProfile,
  type CourseLookup,
} from "@/lib/admin-student-onboarding";
import { loadAuthEmailIndex } from "@/lib/admin-student-overview";
import { getPlatformSettingsAdmin } from "@/lib/platform-settings";
import type { Database } from "@/types/database";

export type BulkUploadFailure = {
  row: number;
  email: string;
  reason: string;
};

export type BulkUploadResult = {
  message: string;
  bulkSummary: {
    created: number;
    enrolled: number;
    skipped: number;
    failed: BulkUploadFailure[];
  };
};

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://digitalskillx.com").replace(/\/$/, "");
}

function isUploadedCsvFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof (value as File).arrayBuffer === "function" &&
    "size" in value &&
    value.size > 0
  );
}

/** Decode CSV bytes — handles UTF-8/UTF-16 BOMs from Excel exports. */
export async function decodeCsvUpload(bytes: ArrayBuffer): Promise<string> {
  const view = new Uint8Array(bytes);
  if (view.length >= 2 && view[0] === 0xff && view[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (view.length >= 2 && view[0] === 0xfe && view[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const sampleLen = Math.min(view.length, 400);
  let utf16Nulls = 0;
  for (let i = 1; i < sampleLen; i += 2) {
    if (view[i] === 0) utf16Nulls++;
  }
  if (sampleLen > 20 && utf16Nulls / (sampleLen / 2) > 0.35) {
    return new TextDecoder("utf-16le").decode(bytes);
  }

  return utf8;
}

/** Parse CSV text from a file upload or pasted form field. */
export async function readCsvFromFormData(formData: FormData): Promise<string | null> {
  const file = formData.get("csv_file");
  const pasted = String(formData.get("csv") ?? "").trim();

  if (isUploadedCsvFile(file)) {
    try {
      return decodeCsvUpload(await file.arrayBuffer());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read CSV file.";
      throw new Error(message);
    }
  }

  return pasted || null;
}

/** Core CSV bulk enrollment used by server actions and API routes. */
export async function runBulkStudentCsvUpload(params: {
  admin: SupabaseClient<Database>;
  adminUserId: string;
  csvText: string;
  defaultCourseId: string | null;
  enrollableCourses?: CourseLookup[];
}): Promise<BulkUploadResult> {
  const csvText = params.csvText.trim();
  if (!csvText) {
    throw new Error("Upload a CSV file or paste CSV rows.");
  }

  const enrollableCourses =
    params.enrollableCourses ??
    (await (async () => {
      const { data, error } = await params.admin.from("courses").select("id, title").order("title");
      if (error) throw new Error(error.message);
      return (data ?? []) as CourseLookup[];
    })());

  const resolveCourse = buildCourseResolver(enrollableCourses);
  const settings = await getPlatformSettingsAdmin();
  const { rows } = parseStudentCsv(csvText);
  const authIndex = await loadAuthEmailIndex(params.admin);

  if (rows.length === 0) {
    throw new Error("No data rows found in the CSV.");
  }

  let created = 0;
  let enrolled = 0;
  let skipped = 0;
  const failed: BulkUploadFailure[] = [];

  async function grantAccessToStudent(grantParams: {
    studentId: string;
    fullName: string;
    email: string;
    courseId: string;
    sendWelcome?: { password: string; courseTitle: string | null };
  }) {
    await ensureImportedStudentProfile(params.admin, {
      studentId: grantParams.studentId,
      email: grantParams.email,
      fullName: grantParams.fullName,
    });

    const { newlyEnrolled } = await grantCourseAccessToStudent(params.admin, {
      studentId: grantParams.studentId,
      courseIds: [grantParams.courseId],
      enrolledBy: params.adminUserId,
      fullName: grantParams.fullName,
      email: grantParams.email,
      sendEnrollmentEmail: !grantParams.sendWelcome,
      authIndex,
    });

    if (newlyEnrolled.length > 0) {
      const canonicalStudentId = await resolveCanonicalStudentId(
        params.admin,
        {
          studentId: grantParams.studentId,
          email: grantParams.email,
        },
        authIndex,
      );
      const { enrolledCourseIds } = await verifyStudentCourseAccess(params.admin, canonicalStudentId, [
        grantParams.courseId,
      ]);
      if (enrolledCourseIds.length === 0) {
        throw new Error("Course enrollment did not save");
      }
    }

    if (grantParams.sendWelcome) {
      const canonicalStudentId = await resolveCanonicalStudentId(
        params.admin,
        {
          studentId: grantParams.studentId,
          email: grantParams.email,
        },
        authIndex,
      );
      await sendStudentWelcomeEmail({
        studentId: canonicalStudentId,
        fullName: grantParams.fullName,
        email: grantParams.email,
        password: grantParams.sendWelcome.password,
        courseNames: grantParams.sendWelcome.courseTitle ? [grantParams.sendWelcome.courseTitle] : [],
        siteUrl: siteUrl(),
        brandColor: settings.primary_color,
      });
      created++;
    } else if (newlyEnrolled.length > 0) {
      enrolled++;
    } else {
      skipped++;
    }
  }

  for (const row of rows) {
    const rowNumber = row.rowNumber;
    const fullName = row.fullName;
    const email = row.email;
    const courseRefRaw = row.courseRef;

    if (!fullName && !email) continue;
    if (!email) {
      failed.push({
        row: rowNumber,
        email: "(missing)",
        reason: "Email is required on each row",
      });
      continue;
    }
    if (!fullName) {
      failed.push({
        row: rowNumber,
        email,
        reason: "Could not determine student name for this row",
      });
      continue;
    }
    if (!isValidStudentEmail(email)) {
      failed.push({ row: rowNumber, email, reason: "Invalid email format" });
      continue;
    }

    const resolved = resolveCourse(courseRefRaw, params.defaultCourseId);
    if (resolved.error) {
      failed.push({ row: rowNumber, email, reason: resolved.error });
      continue;
    }
    if (!resolved.courseId) {
      failed.push({
        row: rowNumber,
        email,
        reason: "No course on row and no default course selected for this upload",
      });
      continue;
    }

    const existing = await findProfileByEmail(params.admin, email);
    if (existing) {
      if (existing.is_suspended) {
        failed.push({ row: rowNumber, email, reason: "Student account is suspended" });
        continue;
      }
      try {
        await grantAccessToStudent({
          studentId: existing.id,
          fullName: existing.full_name ?? fullName,
          email: existing.email,
          courseId: resolved.courseId,
        });
      } catch (rowError) {
        failed.push({
          row: rowNumber,
          email,
          reason: rowError instanceof Error ? rowError.message : "Enrollment failed",
        });
      }
      continue;
    }

    const existingAuthId = await resolveStudentIdByEmail(params.admin, email, authIndex);
    if (existingAuthId) {
      try {
        await grantAccessToStudent({
          studentId: existingAuthId,
          fullName,
          email,
          courseId: resolved.courseId,
        });
      } catch (rowError) {
        failed.push({
          row: rowNumber,
          email,
          reason: rowError instanceof Error ? rowError.message : "Enrollment failed",
        });
      }
      continue;
    }

    const password = generateStrongPassword();
    const { data: createdUser, error } = await params.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      const authId = await resolveStudentIdByEmail(params.admin, email, authIndex);
      if (authId) {
        try {
          await grantAccessToStudent({
            studentId: authId,
            fullName,
            email,
            courseId: resolved.courseId,
          });
        } catch (rowError) {
          failed.push({
            row: rowNumber,
            email,
            reason: rowError instanceof Error ? rowError.message : "Enrollment failed",
          });
        }
        continue;
      }
      failed.push({ row: rowNumber, email, reason: error.message });
      continue;
    }

    try {
      await params.admin.from("profiles").update({ full_name: fullName }).eq("id", createdUser.user.id);
      await waitForStudentProfile(params.admin, createdUser.user.id);
      await runAutomations("account_created", { studentId: createdUser.user.id });
      await grantAccessToStudent({
        studentId: createdUser.user.id,
        fullName,
        email,
        courseId: resolved.courseId,
        sendWelcome: { password, courseTitle: resolved.courseTitle },
      });
    } catch (rowError) {
      failed.push({
        row: rowNumber,
        email,
        reason: rowError instanceof Error ? rowError.message : "Enrollment or email failed",
      });
    }
  }

  return {
    message: `Bulk upload finished: ${created} created, ${enrolled} existing student(s) enrolled, ${skipped} skipped, ${failed.length} failed.`,
    bulkSummary: { created, enrolled, skipped, failed },
  };
}
