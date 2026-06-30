import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationType } from "@/types/database";

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
  const supabase = createAdminClient();
  await supabase.from("notifications").insert({
    student_id: params.studentId,
    type: params.type,
    title: params.title ?? null,
    message: params.message,
    link_url: params.linkUrl ?? null,
  });
}

export async function notifyMany(
  studentIds: string[],
  params: Omit<Parameters<typeof notify>[0], "studentId">,
) {
  if (studentIds.length === 0) return;
  const supabase = createAdminClient();
  await supabase.from("notifications").insert(
    studentIds.map((studentId) => ({
      student_id: studentId,
      type: params.type,
      title: params.title ?? null,
      message: params.message,
      link_url: params.linkUrl ?? null,
    })),
  );
}
