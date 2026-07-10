import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { issueCertificate } from "@/lib/certificates";
import type { AutomationTrigger } from "@/types/database";

export type AutomationAction =
  | { type: "send_email"; subject: string; body: string }
  | { type: "send_notification"; message: string }
  | { type: "enroll_course"; course_id: string }
  | { type: "issue_certificate"; course_id?: string }
  | { type: "add_tag"; tag: string }
  | { type: "notify_admin"; message: string };

export type AutomationContext = {
  studentId: string;
  courseId?: string;
  lessonId?: string;
  quizId?: string;
};

/**
 * Runs all active automation rules matching a trigger event (PRD §16).
 * Best-effort and isolated: one failing action never blocks the others.
 */
export async function runAutomations(
  event: AutomationTrigger,
  ctx: AutomationContext,
) {
  const supabase = await createAdminClientAsync();

  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("trigger_event", event)
    .eq("is_active", true);

  if (!rules?.length) return;

  const { data: student } = await supabase
    .from("profiles")
    .select("full_name, email, tags")
    .eq("id", ctx.studentId)
    .single();

  for (const rule of rules) {
    const conditions = (rule.trigger_conditions ?? {}) as Record<string, unknown>;
    // Simple condition matching: course_id must match when specified.
    if (conditions.course_id && conditions.course_id !== ctx.courseId) continue;

    const actions = (rule.actions ?? []) as AutomationAction[];
    for (const action of actions) {
      try {
        await executeAction(action, ctx, student?.email, student?.full_name);
      } catch (err) {
        console.error("[automation] action failed", rule.id, action.type, err);
      }
    }

    try {
      await supabase.from("audit_logs").insert({
        action: "automation_executed",
        target_type: "automation_rule",
        target_id: rule.id,
        metadata: { event, context: ctx },
      });
    } catch (err) {
      console.error("[automation] audit log failed", rule.id, err);
    }
  }
}

async function executeAction(
  action: AutomationAction,
  ctx: AutomationContext,
  email?: string | null,
  name?: string | null,
) {
  const supabase = await createAdminClientAsync();
  switch (action.type) {
    case "send_email":
      if (email) {
        const tpl = emailTemplates.announcement({
          subject: action.subject,
          body: action.body,
        });
        await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
      }
      break;
    case "send_notification":
      await notify({
        studentId: ctx.studentId,
        type: "announcement",
        message: action.message,
      });
      break;
    case "enroll_course":
      await supabase
        .from("enrollments")
        .insert({
          student_id: ctx.studentId,
          course_id: action.course_id,
          source: "admin",
        })
        .select()
        .maybeSingle();
      break;
    case "issue_certificate": {
      const courseId = action.course_id ?? ctx.courseId;
      if (courseId)
        await issueCertificate({ studentId: ctx.studentId, courseId });
      break;
    }
    case "add_tag": {
      const { data: p } = await supabase
        .from("profiles")
        .select("tags")
        .eq("id", ctx.studentId)
        .single();
      const tags = new Set([...(p?.tags ?? []), action.tag]);
      await supabase
        .from("profiles")
        .update({ tags: Array.from(tags) })
        .eq("id", ctx.studentId);
      break;
    }
    case "notify_admin": {
      const adminAddr = process.env.ZEPTOMAIL_FROM_EMAIL;
      if (adminAddr) {
        await sendEmail({
          to: adminAddr,
          subject: "Automation alert",
          html: `<p>${action.message}</p><p>Student: ${name ?? ctx.studentId}</p>`,
        });
      }
      break;
    }
  }
}
