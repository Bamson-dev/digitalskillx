import type { BulkUploadFailure } from "@/lib/bulk-student-upload";

export type BulkImportStatusJson = {
  error?: string;
  processedRows: number;
  totalRows: number;
  created: number;
  enrolled: number;
  skipped: number;
  failed: number;
  failures?: BulkUploadFailure[];
  done: boolean;
  phase?: string;
  emailsSent?: number;
  emailsFailed?: number;
  emailsQueued?: number;
  emailsPending?: number;
  resendReady?: boolean;
  emailError?: string | null;
};

export type BulkImportPollSummary = {
  processedRows: number;
  totalRows: number;
  created: number;
  enrolled: number;
  skipped: number;
  failed: number;
  failures: BulkUploadFailure[];
  done: boolean;
  phase?: string;
  emailsSent?: number;
  emailsFailed?: number;
  emailsQueued?: number;
  emailsPending?: number;
  resendReady?: boolean;
  emailError?: string | null;
};

async function fetchBulkJobStatus(jobId: string) {
  let statusRes: Response | null = null;
  let statusRaw = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      statusRes = await fetch("/api/admin/bulk-students", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", jobId }),
      });
      statusRaw = await statusRes.text();
      if (
        statusRes.ok ||
        (statusRes.status >= 400 && statusRes.status < 500 && statusRes.status !== 408)
      ) {
        break;
      }
    } catch {
      statusRes = null;
      statusRaw = "";
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return statusRes ? { statusRes, statusRaw } : null;
}

export async function readBulkImportJobStatus(jobId: string) {
  const fetched = await fetchBulkJobStatus(jobId);
  if (!fetched) {
    return { ok: false as const, error: "Could not reach the server.", status: 0 };
  }
  const { statusRes, statusRaw } = fetched;
  let statusJson: BulkImportStatusJson;
  try {
    statusJson = JSON.parse(statusRaw) as BulkImportStatusJson;
  } catch {
    return {
      ok: false as const,
      error: `Could not read import status (${statusRes.status}).`,
      status: statusRes.status,
    };
  }
  if (!statusRes.ok) {
    return {
      ok: false as const,
      error: statusJson.error ?? `Status failed (${statusRes.status}).`,
      status: statusRes.status,
    };
  }
  return { ok: true as const, status: statusJson };
}

function toSummary(statusJson: BulkImportStatusJson): BulkImportPollSummary {
  return {
    processedRows: statusJson.processedRows,
    totalRows: statusJson.totalRows,
    created: statusJson.created,
    enrolled: statusJson.enrolled,
    skipped: statusJson.skipped,
    failed: statusJson.failed,
    failures: statusJson.failures ?? [],
    done: statusJson.done,
    phase: statusJson.phase,
    emailsSent: statusJson.emailsSent,
    emailsFailed: statusJson.emailsFailed,
    emailsQueued: statusJson.emailsQueued,
    emailsPending: statusJson.emailsPending,
    resendReady: statusJson.resendReady,
    emailError: statusJson.emailError,
  };
}

export function bulkImportFinishedMessage(summary: BulkImportPollSummary) {
  const skippedNote =
    summary.skipped > 0
      ? ` Skipped students were already enrolled in this course.`
      : "";
  const emailNote =
    summary.emailsQueued != null
      ? ` Emails: ${summary.emailsSent ?? 0} sent, ${summary.emailsFailed ?? 0} failed (${summary.emailsQueued} queued${
          summary.emailsPending ? `, ${summary.emailsPending} still sending` : ""
        }).`
      : "";
  return `Bulk upload finished: ${summary.created} new account(s), ${summary.enrolled} existing student(s) enrolled, ${summary.skipped} already enrolled (skipped), ${summary.failed} failed.${skippedNote}${emailNote}`;
}

export async function kickBulkImportJob(jobId: string) {
  try {
    const res = await fetch("/api/admin/bulk-students", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "process", jobId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function kickBulkEmailDrain(jobId: string) {
  try {
    const res = await fetch("/api/admin/bulk-students", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "drain_emails", jobId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pollBulkImportJob(
  jobId: string,
  totalRows: number,
  onUpdate: (update: {
    message?: string;
    progress?: { processed: number; total: number };
    bulkJobId: string;
    error?: string;
  }) => void,
): Promise<{ ok: true; summary: BulkImportPollSummary } | { ok: false; error: string }> {
  const pollStarted = Date.now();
  const maxWaitMs = Math.max(45 * 60_000, totalRows * 3_000);
  let previousProcessed = 0;
  let lastSummary: BulkImportPollSummary | null = null;
  let statusFailRounds = 0;
  let kickInFlight: Promise<boolean> | null = null;

  const kickIfIdle = () => {
    if (kickInFlight) return;
    const sendingEmails = lastSummary?.phase === "sending_emails" || (lastSummary?.emailsPending ?? 0) > 0;
    kickInFlight = (
      sendingEmails && lastSummary && lastSummary.processedRows >= lastSummary.totalRows
        ? kickBulkEmailDrain(jobId)
        : kickBulkImportJob(jobId)
    ).finally(() => {
      kickInFlight = null;
    });
  };

  kickIfIdle();

  while (Date.now() - pollStarted < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 2000));
    kickIfIdle();

    const fetched = await fetchBulkJobStatus(jobId);
    if (!fetched) {
      statusFailRounds += 1;
      onUpdate({
        message: `Job ${jobId.slice(0, 8)}… connection issue — retrying status (${statusFailRounds})…`,
        progress: lastSummary
          ? { processed: lastSummary.processedRows, total: lastSummary.totalRows }
          : { processed: 0, total: totalRows },
        bulkJobId: jobId,
      });
      if (statusFailRounds >= 12) {
        return {
          ok: false,
          error: `Could not reach the server for job status. Job ID: ${jobId}. Processing may still continue in the background.`,
        };
      }
      continue;
    }

    const { statusRes, statusRaw } = fetched;
    let statusJson: BulkImportStatusJson;
    try {
      statusJson = JSON.parse(statusRaw) as BulkImportStatusJson;
    } catch {
      statusFailRounds += 1;
      if (statusFailRounds >= 12) {
        return {
          ok: false,
          error: `Could not read import status (${statusRes.status}). Job ID: ${jobId}. Processing may still continue in the background.`,
        };
      }
      onUpdate({
        message: `Job ${jobId.slice(0, 8)}… waiting for server (${statusRes.status}) — retrying…`,
        progress: lastSummary
          ? { processed: lastSummary.processedRows, total: lastSummary.totalRows }
          : { processed: 0, total: totalRows },
        bulkJobId: jobId,
      });
      continue;
    }

    if (!statusRes.ok) {
      statusFailRounds += 1;
      if (statusFailRounds >= 8) {
        return {
          ok: false,
          error: statusJson.error ?? `Status failed (${statusRes.status}). Job ID: ${jobId}`,
        };
      }
      continue;
    }

    statusFailRounds = 0;
    lastSummary = toSummary(statusJson);
    const phaseLabel = statusJson.phase?.replace(/_/g, " ") ?? "processing";
    const waiting = statusJson.processedRows <= previousProcessed;
    if (!waiting) previousProcessed = statusJson.processedRows;
    const emailPart =
      statusJson.phase === "sending_emails" || (statusJson.emailsPending ?? 0) > 0
        ? ` Sending emails: ${statusJson.emailsSent ?? 0} sent, ${statusJson.emailsPending ?? 0} waiting.${
            statusJson.resendReady === false
              ? " Resend is not configured on Vercel — add RESEND_API_KEY and redeploy."
              : statusJson.emailError
                ? ` Last error: ${statusJson.emailError.slice(0, 120)}`
                : ""
          }`
        : "";
    onUpdate({
      message: waiting
        ? `Job ${jobId.slice(0, 8)}… still working ${statusJson.processedRows} / ${statusJson.totalRows}.${emailPart} Keep this page open.`
        : `Job ${jobId.slice(0, 8)}… ${phaseLabel}: ${statusJson.processedRows} / ${statusJson.totalRows} rows.${emailPart}`,
      progress: {
        processed: statusJson.processedRows,
        total: statusJson.totalRows,
      },
      bulkJobId: jobId,
    });

    if (statusJson.done) {
      return { ok: true, summary: lastSummary };
    }
  }

  if (lastSummary?.done) {
    return { ok: true, summary: lastSummary };
  }

  return {
    ok: false,
    error: `Timed out waiting for job ${jobId}. Click Resume job and keep this page open until you see Bulk upload finished.`,
  };
}
