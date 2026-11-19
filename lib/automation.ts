import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { issueCertificate } from "@/lib/certificates";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";
import type { AutomationTrigger } from "@/types/database";

/** Prevent daily cron from re-firing the same inactivity rule for the same student. */
const INACTIVITY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
    if (conditions.course_id && conditions.course_id !== ctx.courseId) continue;
    if (typeof conditions.has_tag === "string" && conditions.has_tag) {
      const tags = (student?.tags ?? []).map((t) => t.toLowerCase());
      if (!tags.includes(String(conditions.has_tag).toLowerCase())) continue;
    }
    if (typeof conditions.min_purchase_count === "number" && conditions.min_purchase_count > 0) {
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("student_id", ctx.studentId)
        .eq("status", "success");
      if ((count ?? 0) < conditions.min_purchase_count) continue;
    }

    if (event === "student_inactive") {
      const since = new Date(Date.now() - INACTIVITY_COOLDOWN_MS).toISOString();
      const { data: recent } = await supabase
        .from("audit_logs")
        .select("id")
        .eq("action", "automation_executed")
        .eq("target_type", "automation_rule")
        .eq("target_id", rule.id)
        .gte("created_at", since)
        .filter("metadata->context->>studentId", "eq", ctx.studentId)
        .limit(1)
        .maybeSingle();
      if (recent) continue;
    }

    const actions = (rule.actions ?? []) as AutomationAction[];
    for (const action of actions) {
      try {
        await executeAction(action, ctx, student?.email, student?.full_name);
      } catch (err) {
        secureLogError("automation", ErrorCode.AUTOMATION_FAILED, "action failed", {
          ruleId: rule.id,
          actionType: action.type,
          error: err instanceof Error ? err.message : String(err),
        });
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
      secureLogError("automation", ErrorCode.DATABASE_QUERY_FAILED, "audit log failed", {
        ruleId: rule.id,
        error: err instanceof Error ? err.message : String(err),
      });
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
      const adminAddr =
        process.env.RESEND_FROM_EMAIL?.trim() ||
        process.env.ADMIN_EMAIL?.trim() ||
        "courses@digitalskillx.com";
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
