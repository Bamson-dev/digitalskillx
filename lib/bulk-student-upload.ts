import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutomations } from "@/lib/automation";
import {
  buildCourseResolver,
  findProfileByEmail,
  generateStrongPassword,
  grantCourseAccessForBulkImport,
  isValidStudentEmail,
  parseStudentCsv,
  resolveStudentIdByEmail,
  sendStudentWelcomeEmail,
  waitForStudentProfile,
  type CourseLookup,
} from "@/lib/admin-student-onboarding";
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

/** Sync path row cap when job tables are unavailable. */
export const BULK_SYNC_MAX_ROWS = 150;

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
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error("CSV file is too large (max 5 MB). Split the file and try again.");
    }
    try {
      return decodeCsvUpload(await file.arrayBuffer());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read CSV file.";
      throw new Error(message);
    }
  }

  return pasted || null;
}

/**
 * Synchronous CSV bulk enrollment for small files (≤150 rows).
 * Uses slim enroll path — no Auth full-scan, deferred welcome emails via fire-and-forget.
 */
export async function runBulkStudentCsvUpload(params: {
  admin: SupabaseClient<Database>;
  adminUserId: string;
  csvText: string;
  defaultCourseId: string | null;
  enrollableCourses?: CourseLookup[];
  maxRows?: number;
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
  const dataRows = rows.filter((r) => r.email || r.fullName);

  if (dataRows.length === 0) {
    throw new Error("No data rows found in the CSV.");
  }

  const maxRows = params.maxRows ?? BULK_SYNC_MAX_ROWS;
  if (dataRows.length > maxRows) {
    throw new Error(
      `This upload has ${dataRows.length} rows. Use the chunked job importer for files over ${maxRows} rows (or run migration 0028).`,
    );
  }

  // Dedupe emails within file (first occurrence wins).
  const seen = new Set<string>();
  const uniqueRows = dataRows.filter((row) => {
    const email = row.email.trim().toLowerCase();
    if (!email) return true;
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });

  let created = 0;
  let enrolled = 0;
  let skipped = 0;
  const failed: BulkUploadFailure[] = [];
  const knownIds = new Map<string, string>();

  for (const row of uniqueRows) {
    const rowNumber = row.rowNumber;
    let fullName = row.fullName.trim();
    const email = row.email.trim().toLowerCase();
    const courseRefRaw = row.courseRef;

    if (!fullName && !email) continue;
    if (!email) {
      failed.push({ row: rowNumber, email: "(missing)", reason: "Email is required on each row" });
      continue;
    }
    if (!isValidStudentEmail(email)) {
      failed.push({ row: rowNumber, email, reason: "Invalid email format" });
      continue;
    }
    if (!fullName) {
      fullName = email.split("@")[0] || "Student";
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

    try {
      let studentId = knownIds.get(email) ?? null;
      let isNew = false;
      let password: string | null = null;

      if (!studentId) {
        const existing = await findProfileByEmail(params.admin, email);
        if (existing) {
          if (existing.is_suspended) {
            failed.push({ row: rowNumber, email, reason: "Student account is suspended" });
            continue;
          }
          studentId = existing.id;
          fullName = existing.full_name?.trim() || fullName;
        }
      }

      if (!studentId) {
        studentId = await resolveStudentIdByEmail(params.admin, email);
      }

      if (!studentId) {
        password = generateStrongPassword();
        const { data: createdUser, error } = await params.admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error) {
          const recovered = await resolveStudentIdByEmail(params.admin, email);
          if (!recovered) {
            failed.push({ row: rowNumber, email, reason: error.message });
            continue;
          }
          studentId = recovered;
        } else {
          studentId = createdUser.user.id;
          isNew = true;
          await params.admin.from("profiles").update({ full_name: fullName }).eq("id", studentId);
          await waitForStudentProfile(params.admin, studentId);
          try {
            await runAutomations("account_created", { studentId });
          } catch (err) {
            console.error("[runBulkStudentCsvUpload] automation", err);
          }
        }
      }

      knownIds.set(email, studentId);

      const { newlyEnrolled } = await grantCourseAccessForBulkImport(params.admin, {
        studentId,
        courseId: resolved.courseId,
        enrolledBy: params.adminUserId,
        fullName,
        email,
      });

      if (isNew && password) {
        void sendStudentWelcomeEmail({
          studentId,
          fullName,
          email,
          password,
          courseNames: resolved.courseTitle ? [resolved.courseTitle] : [],
          siteUrl: siteUrl(),
          brandColor: settings.primary_color,
        }).catch((err) => console.error("[runBulkStudentCsvUpload] welcome email", err));
        created++;
      } else if (newlyEnrolled) {
        enrolled++;
      } else {
        skipped++;
      }
    } catch (rowError) {
      failed.push({
        row: rowNumber,
        email,
        reason: rowError instanceof Error ? rowError.message : "Enrollment failed",
      });
    }
  }

  return {
    message: `Bulk upload finished: ${created} created, ${enrolled} existing student(s) enrolled, ${skipped} skipped, ${failed.length} failed.`,
    bulkSummary: { created, enrolled, skipped, failed },
  };
}
