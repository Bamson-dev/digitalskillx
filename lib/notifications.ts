import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import type { NotificationType } from "@/types/database";
import {
  fallbackNotificationType,
  isMissingEnumValueError,
} from "@/lib/ensure-program-course-notify";

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
  const supabase = await createAdminClientAsync();
  const rows = [
    {
      student_id: params.studentId,
      type: params.type,
      title: params.title ?? null,
      message: params.message,
      link_url: params.linkUrl ?? null,
    },
  ];
  const { error } = await supabase.from("notifications").insert(rows);
  if (error && isMissingEnumValueError(error.message)) {
    const { error: fallbackError } = await supabase.from("notifications").insert([
      {
        ...rows[0],
        type: fallbackNotificationType(params.type),
      },
    ]);
    if (fallbackError) throw new Error(fallbackError.message);
    return;
  }
  if (error) throw new Error(error.message);
}

export async function notifyMany(
  studentIds: string[],
  params: Omit<Parameters<typeof notify>[0], "studentId">,
) {
  if (studentIds.length === 0) return;
  const supabase = await createAdminClientAsync();
  const rows = studentIds.map((studentId) => ({
    student_id: studentId,
    type: params.type,
    title: params.title ?? null,
    message: params.message,
    link_url: params.linkUrl ?? null,
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error && isMissingEnumValueError(error.message)) {
    const { error: fallbackError } = await supabase.from("notifications").insert(
      rows.map((row) => ({
        ...row,
        type: fallbackNotificationType(params.type),
      })),
    );
    if (fallbackError) throw new Error(fallbackError.message);
    return;
  }
  if (error) throw new Error(error.message);
}
