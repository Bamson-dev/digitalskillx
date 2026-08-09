import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { paystackSecretKeyConfigured } from "@/lib/env-paystack";
import { getContaboIntegrationStatus } from "@/lib/storage";
import { getEmailSenderConfig } from "@/lib/platform-settings";
import { isMissingRelationError } from "@/lib/schema-guard";

export type HealthStatus = "operational" | "degraded" | "unavailable" | "unknown";

export type HealthComponent = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  lastCheckedAt: string;
  lastFailure?: string | null;
};

/**
 * Lightweight admin system health snapshot — no secret values, no expensive scans.
 */
export async function getSystemHealthSnapshot(): Promise<{
  overall: HealthStatus;
  components: HealthComponent[];
}> {
  const checkedAt = new Date().toISOString();
  const components: HealthComponent[] = [];

  // Application
  components.push({
    id: "application",
    label: "Application",
    status: "operational",
    detail: "Next.js runtime responding",
    lastCheckedAt: checkedAt,
  });

  // Database
  let dbOk = false;
  let dbDetail = "Database check failed";
  try {
    const admin = await createAdminClientAsync();
    const { error } = await admin.from("courses").select("id").limit(1);
    dbOk = !error;
    dbDetail = error ? error.message : "Connected";
  } catch (err) {
    dbDetail = err instanceof Error ? err.message : "Database unavailable";
  }
  components.push({
    id: "database",
    label: "Database",
    status: dbOk ? "operational" : "unavailable",
    detail: dbDetail,
    lastCheckedAt: checkedAt,
    lastFailure: dbOk ? null : dbDetail,
  });

  // Contabo / object storage (config only — no live network probe here)
  const contabo = getContaboIntegrationStatus();
  components.push({
    id: "contabo",
    label: "Contabo storage",
    status: contabo.configured ? "operational" : "degraded",
    detail: contabo.configured
      ? `Provider ${contabo.provider} configured`
      : contabo.reason,
    lastCheckedAt: checkedAt,
    lastFailure: contabo.configured ? null : contabo.reason,
  });

  // Supabase storage buckets are separate — report as configured via same DB connectivity
  components.push({
    id: "storage",
    label: "App storage",
    status: dbOk ? "operational" : "unavailable",
    detail: dbOk
      ? "Supabase Storage available when database is reachable"
      : "Cannot verify storage without database",
    lastCheckedAt: checkedAt,
  });

  // Email
  let emailStatus: HealthStatus = "unknown";
  let emailDetail = "Email settings unread";
  try {
    const sender = await getEmailSenderConfig();
    const hasFrom = Boolean(sender.fromAddress?.trim());
    emailStatus = hasFrom ? "operational" : "degraded";
    emailDetail = hasFrom
      ? "Sender address configured"
      : "No from-address configured — outbound email may fail";
  } catch (err) {
    emailStatus = "degraded";
    emailDetail = err instanceof Error ? err.message : "Email config check failed";
  }
  components.push({
    id: "email",
    label: "Email",
    status: emailStatus,
    detail: emailDetail,
    lastCheckedAt: checkedAt,
    lastFailure: emailStatus === "operational" ? null : emailDetail,
  });

  // Paystack
  const paystackReady = await paystackSecretKeyConfigured();
  components.push({
    id: "payment",
    label: "Payment provider",
    status: paystackReady ? "operational" : "degraded",
    detail: paystackReady ? "Paystack secret configured" : "Paystack secret not configured",
    lastCheckedAt: checkedAt,
    lastFailure: paystackReady ? null : "Paystack secret not configured",
  });

  // Automations + background jobs (counts only)
  let automationDetail = "No recent failures sampled";
  let automationStatus: HealthStatus = dbOk ? "operational" : "unavailable";
  let jobsDetail = "Outbox not checked";
  let jobsStatus: HealthStatus = dbOk ? "operational" : "unavailable";
  let notifyDetail = "Notifications table reachable";
  let notifyStatus: HealthStatus = dbOk ? "operational" : "unavailable";

  if (dbOk) {
    try {
      const admin = await createAdminClientAsync();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: autoFailApprox } = await admin
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("action", "automation_executed")
        .gte("created_at", since)
        .limit(1);
      automationDetail = `${autoFailApprox ?? 0} automation executions in last 24h (audit)`;

      const { count: pendingOutbox, error: outboxErr } = await admin
        .from("bulk_import_email_outbox" as never)
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "sending", "failed"] as never);

      if (outboxErr && isMissingRelationError(outboxErr.message)) {
        jobsDetail = "Email outbox table not present";
        jobsStatus = "degraded";
      } else if (outboxErr) {
        jobsDetail = outboxErr.message;
        jobsStatus = "degraded";
      } else {
        const n = pendingOutbox ?? 0;
        jobsDetail = `${n} outbox rows pending/sending/failed`;
        jobsStatus = n > 500 ? "degraded" : "operational";
      }

      const { count: failedJobs } = await admin
        .from("bulk_import_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", since);
      if ((failedJobs ?? 0) > 0) {
        jobsDetail += `; ${failedJobs} failed imports (24h)`;
        jobsStatus = "degraded";
      }

      const { error: notifyErr } = await admin.from("notifications").select("id").limit(1);
      if (notifyErr) {
        notifyStatus = "degraded";
        notifyDetail = notifyErr.message;
      }
    } catch (err) {
      automationStatus = "degraded";
      jobsStatus = "degraded";
      notifyStatus = "degraded";
      const msg = err instanceof Error ? err.message : String(err);
      automationDetail = msg;
      jobsDetail = msg;
      notifyDetail = msg;
    }
  }

  components.push({
    id: "automations",
    label: "Automation system",
    status: automationStatus,
    detail: automationDetail,
    lastCheckedAt: checkedAt,
  });
  components.push({
    id: "background_jobs",
    label: "Background jobs",
    status: jobsStatus,
    detail: jobsDetail,
    lastCheckedAt: checkedAt,
    lastFailure: jobsStatus === "operational" ? null : jobsDetail,
  });
  components.push({
    id: "notifications",
    label: "Notifications",
    status: notifyStatus,
    detail: notifyDetail,
    lastCheckedAt: checkedAt,
  });

  const ranks: Record<HealthStatus, number> = {
    unavailable: 3,
    degraded: 2,
    unknown: 1,
    operational: 0,
  };
  const overall = components.reduce<HealthStatus>((acc, c) => {
    return ranks[c.status] > ranks[acc] ? c.status : acc;
  }, "operational");

  return { overall, components };
}
