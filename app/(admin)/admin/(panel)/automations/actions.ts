"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { AutomationTrigger, Json } from "@/types/database";
import type { AutomationAction } from "@/lib/automation";

export async function createRule(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  const actionType = String(formData.get("action_type"));
  let action: AutomationAction;
  switch (actionType) {
    case "send_email":
      action = {
        type: "send_email",
        subject: String(formData.get("action_subject") ?? ""),
        body: String(formData.get("action_body") ?? ""),
      };
      break;
    case "enroll_course":
      action = { type: "enroll_course", course_id: String(formData.get("action_course_id") ?? "") };
      break;
    case "issue_certificate":
      action = { type: "issue_certificate", course_id: String(formData.get("action_course_id") ?? "") || undefined };
      break;
    case "add_tag":
      action = { type: "add_tag", tag: String(formData.get("action_tag") ?? "") };
      break;
    case "notify_admin":
      action = { type: "notify_admin", message: String(formData.get("action_message") ?? "") };
      break;
    default:
      action = { type: "send_notification", message: String(formData.get("action_message") ?? "") };
  }

  const conditionCourse = String(formData.get("condition_course_id") ?? "");
  const conditions: Json = conditionCourse ? { course_id: conditionCourse } : {};

  await supabase.from("automation_rules").insert({
    name: String(formData.get("name") ?? "Untitled rule"),
    trigger_event: String(formData.get("trigger_event") ?? "course_completed") as AutomationTrigger,
    trigger_conditions: conditions,
    actions: [action] as unknown as Json,
    is_active: true,
  });

  await logAudit({ action: "automation_rule_created" });
  revalidatePath("/admin/automations");
}

export async function toggleRule(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const active = formData.get("is_active") === "true";
  await supabase.from("automation_rules").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/automations");
}

export async function deleteRule(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("automation_rules").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/automations");
}
