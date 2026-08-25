import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import type { NotificationType } from "@/types/database";
import {
  fallbackNotificationType,
  isMissingEnumValueError,
} from "@/lib/ensure-program-course-notify";
import { formatPostgrestError } from "@/lib/postgrest-error";

const NOTIFY_BATCH = 40;

function buildNotificationRow(params: {
  studentId: string;
  type: NotificationType;
  message: string;
  title?: string;
  linkUrl?: string;
}) {
  const message = params.message.trim() || "A new course is available on DigitalSkillX.";
  return {
    student_id: params.studentId,
    type: params.type,
    title: params.title?.trim()?.slice(0, 200) || null,
    message: message.slice(0, 2000),
    link_url: params.linkUrl?.trim()?.slice(0, 500) || null,
  };
}

async function insertNotificationRows(
  rows: ReturnType<typeof buildNotificationRow>[],
  preferredType: NotificationType,
) {
  const supabase = await createAdminClientAsync();
  const { error } = await supabase.from("notifications").insert(rows);
  if (!error) return;

  if (isMissingEnumValueError(error.message)) {
    const fallbackType = fallbackNotificationType(preferredType);
    const { error: fallbackError } = await supabase.from("notifications").insert(
      rows.map((row) => ({ ...row, type: fallbackType })),
    );
    if (fallbackError) throw new Error(formatPostgrestError(fallbackError));
    return;
  }

  throw new Error(formatPostgrestError(error));
}

/**
 * Create an in-app notification for a student (PRD §14.1). Uses the admin
 * client so it works from server actions/automation regardless of the actor.
 */
export async function notify(params: {
  studentId: string;
  type: NotificationType;
  message: string;
  title?: string;
  linkUrl?: string;
}) {
  await insertNotificationRows([buildNotificationRow(params)], params.type);
}

export async function notifyMany(
  studentIds: string[],
  params: Omit<Parameters<typeof notify>[0], "studentId">,
) {
  const unique = [...new Set(studentIds.filter(Boolean))];
  if (unique.length === 0) return;

  for (let i = 0; i < unique.length; i += NOTIFY_BATCH) {
    const slice = unique.slice(i, i + NOTIFY_BATCH);
    const rows = slice.map((studentId) =>
      buildNotificationRow({
        studentId,
        type: params.type,
        message: params.message,
        title: params.title,
        linkUrl: params.linkUrl,
      }),
    );
    await insertNotificationRows(rows, params.type);
  }
}
