import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";
import type { Database } from "@/types/database";
import {
  AIMONEYCODE_CAMPAIGN_SLUG,
  AIMONEYCODE_TOTAL_STEPS,
  normalizeEmail,
  type CampaignStatus,
  type EnrollmentSource,
} from "@/lib/email-campaigns/constants";
import type {
  CampaignRecord,
  CampaignStore,
  RecipientRecord,
  SendRecord,
} from "@/lib/email-campaigns/processor";
import type { CandidateRecipient, SelectionPreview } from "@/lib/email-campaigns/selection";
import { extractEmailsFromCsv, filterEnrollmentCandidates, uniqueCandidates } from "@/lib/email-campaigns/selection";

type Admin = SupabaseClient<Database>;

export type CampaignCounts = {
  total: number;
  active: number;
  completed: number;
  unsubscribed: number;
  failed: number;
  waiting: number;
  sent: number;
  sendFailed: number;
  nextScheduledAt: string | null;
};

export type CampaignAdminSnapshot = {
  migrationRequired: boolean;
  campaign: CampaignRecord | null;
  counts: CampaignCounts;
};

const EMPTY_COUNTS: CampaignCounts = {
  total: 0,
  active: 0,
  completed: 0,
  unsubscribed: 0,
  failed: 0,
  waiting: 0,
  sent: 0,
  sendFailed: 0,
  nextScheduledAt: null,
};

const PROFILE_ID_PAGE = 200;
const ENROLLMENT_PAGE = 1000;
const INSERT_PAGE = 250;
const MAX_ENROLLMENT_SCAN = 50_000;
const MAX_OUTBOX_PAGES = 5;

async function listEverEnrolledStudentIds(admin: Admin): Promise<string[]> {
  const ids = new Set<string>();
  for (let from = 0; from < MAX_ENROLLMENT_SCAN; from += ENROLLMENT_PAGE) {
    const { data, error } = await admin
      .from("enrollments")
      .select("student_id")
      .not("student_id", "is", null)
      .range(from, from + ENROLLMENT_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (row.student_id) ids.add(row.student_id);
    }
    if (rows.length < ENROLLMENT_PAGE) break;
  }
  return [...ids];
}

async function listAllStudentProfiles(admin: Admin): Promise<CandidateRecipient[]> {
  const candidates: CandidateRecipient[] = [];
  for (let from = 0; from < MAX_ENROLLMENT_SCAN; from += ENROLLMENT_PAGE) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "student")
      .range(from, from + ENROLLMENT_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      candidates.push({
        email: row.email,
        fullName: row.full_name,
        profileId: row.id,
      });
    }
    if (rows.length < ENROLLMENT_PAGE) break;
  }
  return candidates;
}

async function loadProfilesByIds(admin: Admin, studentIds: string[]): Promise<CandidateRecipient[]> {
  const candidates: CandidateRecipient[] = [];
  for (let i = 0; i < studentIds.length; i += PROFILE_ID_PAGE) {
    const chunk = studentIds.slice(i, i + PROFILE_ID_PAGE);
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      candidates.push({
        email: row.email,
        fullName: row.full_name,
        profileId: row.id,
      });
    }
  }
  return candidates;
}

async function listBulkUploadCandidates(admin: Admin): Promise<CandidateRecipient[]> {
  const studentIds = new Set<string>();
  for (let page = 0; page < MAX_OUTBOX_PAGES; page++) {
    const from = page * ENROLLMENT_PAGE;
    const { data, error } = await admin
      .from("bulk_import_email_outbox")
      .select("student_id")
      .range(from, from + ENROLLMENT_PAGE - 1);
    if (error) {
      if (isMissingRelationError(error.message)) break;
      throw new Error(error.message);
    }
    const rows = data ?? [];
    for (const row of rows) {
      if (row.student_id) studentIds.add(row.student_id);
    }
    if (rows.length < ENROLLMENT_PAGE) break;
  }
  return loadProfilesByIds(admin, [...studentIds]);
}

function asCampaign(row: Record<string, unknown> | null): CampaignRecord | null {
  if (!row) return null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    status: row.status as CampaignStatus,
    total_steps: Number(row.total_steps ?? AIMONEYCODE_TOTAL_STEPS),
  };
}

function asRecipient(row: Record<string, unknown>): RecipientRecord {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    email: String(row.email),
    profile_id: row.profile_id ? String(row.profile_id) : null,
    full_name: row.full_name ? String(row.full_name) : null,
    status: row.status as RecipientRecord["status"],
    next_step: Number(row.next_step),
    last_sent_step: Number(row.last_sent_step ?? 0),
    next_send_at: String(row.next_send_at),
  };
}

function asSend(row: Record<string, unknown>): SendRecord {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    recipient_id: String(row.recipient_id),
    step_number: Number(row.step_number),
    idempotency_key: String(row.idempotency_key),
    status: row.status as SendRecord["status"],
    attempts: Number(row.attempts ?? 0),
    scheduled_at: String(row.scheduled_at),
    provider_message_id: row.provider_message_id ? String(row.provider_message_id) : null,
  };
}

export async function loadCampaignSnapshot(admin: Admin): Promise<CampaignAdminSnapshot> {
  const { data, error } = await admin
    .from("email_campaigns" as never)
    .select("id, slug, name, status, total_steps")
    .eq("slug", AIMONEYCODE_CAMPAIGN_SLUG)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return { migrationRequired: true, campaign: null, counts: EMPTY_COUNTS };
    }
    throw new Error(error.message);
  }

  const campaign = asCampaign((data as Record<string, unknown> | null) ?? null);
  if (!campaign) {
    return { migrationRequired: false, campaign: null, counts: EMPTY_COUNTS };
  }

  const counts = await loadCampaignCounts(admin, campaign.id);
  return { migrationRequired: false, campaign, counts };
}

export async function loadCampaignCounts(admin: Admin, campaignId: string): Promise<CampaignCounts> {
  const [{ data: recipients, error: rErr }, { data: sends, error: sErr }] = await Promise.all([
    admin
      .from("email_campaign_recipients" as never)
      .select("status, next_step, next_send_at")
      .eq("campaign_id", campaignId),
    admin
      .from("email_campaign_sends" as never)
      .select("status")
      .eq("campaign_id", campaignId),
  ]);

  if (rErr) {
    if (isMissingRelationError(rErr.message)) return EMPTY_COUNTS;
    throw new Error(rErr.message);
  }
  if (sErr && !isMissingRelationError(sErr.message)) throw new Error(sErr.message);

  const counts = { ...EMPTY_COUNTS };
  const now = Date.now();
  for (const row of (recipients as Array<Record<string, unknown>> | null) ?? []) {
    counts.total += 1;
    const status = String(row.status);
    if (status === "active") counts.active += 1;
    if (status === "completed") counts.completed += 1;
    if (status === "unsubscribed") counts.unsubscribed += 1;
    if (status === "failed") counts.failed += 1;
    if (
      status === "active" &&
      Number(row.next_step) <= AIMONEYCODE_TOTAL_STEPS
    ) {
      const at = String(row.next_send_at);
      if (new Date(at).getTime() > now) counts.waiting += 1;
      if (!counts.nextScheduledAt || at < counts.nextScheduledAt) {
        counts.nextScheduledAt = at;
      }
    }
  }
  for (const row of (sends as Array<Record<string, unknown>> | null) ?? []) {
    if (String(row.status) === "sent") counts.sent += 1;
    if (String(row.status) === "failed") counts.sendFailed += 1;
  }
  return counts;
}

export async function loadSuppressedEmailSet(admin: Admin): Promise<Set<string>> {
  const { data, error } = await admin.from("email_suppressions" as never).select("email");
  if (error) {
    if (isMissingRelationError(error.message)) return new Set();
    throw new Error(error.message);
  }
  return new Set(
    ((data as Array<{ email: string }> | null) ?? []).map((row) => normalizeEmail(row.email)),
  );
}

export async function loadEnrolledEmailSet(admin: Admin, campaignId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from("email_campaign_recipients" as never)
    .select("email")
    .eq("campaign_id", campaignId);
  if (error) {
    if (isMissingRelationError(error.message)) return new Set();
    throw new Error(error.message);
  }
  return new Set(
    ((data as Array<{ email: string }> | null) ?? []).map((row) => normalizeEmail(row.email)),
  );
}

export async function previewBuyers(
  admin: Admin,
  campaignId: string,
): Promise<SelectionPreview> {
  const { data: txs, error } = await admin
    .from("transactions")
    .select("student_id")
    .eq("status", "success")
    .not("student_id", "is", null)
    .limit(5000);
  if (error) throw new Error(error.message);

  const studentIds = [
    ...new Set((txs ?? []).map((row) => row.student_id).filter((id): id is string => Boolean(id))),
  ];
  return previewFromProfileIds(admin, campaignId, "buyers", studentIds);
}

export async function previewStudents(
  admin: Admin,
  campaignId: string,
): Promise<SelectionPreview> {
  const studentProfiles = await listAllStudentProfiles(admin);
  const enrollmentIds = await listEverEnrolledStudentIds(admin);
  const knownIds = new Set(studentProfiles.map((row) => row.profileId).filter(Boolean) as string[]);
  const missingEnrollmentIds = enrollmentIds.filter((id) => !knownIds.has(id));
  const fromEnrollments = await loadProfilesByIds(admin, missingEnrollmentIds);
  const fromBulkUploads = await listBulkUploadCandidates(admin);
  const { unique } = uniqueCandidates([...studentProfiles, ...fromEnrollments, ...fromBulkUploads]);
  const [suppressed, enrolled] = await Promise.all([
    loadSuppressedEmailSet(admin),
    loadEnrolledEmailSet(admin, campaignId),
  ]);
  return filterEnrollmentCandidates({
    source: "students",
    candidates: unique,
    suppressedEmails: suppressed,
    alreadyEnrolledEmails: enrolled,
  });
}

export async function previewCsv(
  admin: Admin,
  campaignId: string,
  csvText: string,
): Promise<SelectionPreview> {
  const emails = [...new Set(extractEmailsFromCsv(csvText))];
  if (emails.length === 0) {
    return {
      source: "csv",
      selected: [],
      skippedSynthetic: 0,
      skippedInvalid: 0,
      skippedDuplicate: 0,
      skippedSuppressed: 0,
      skippedAlreadyEnrolled: 0,
      unmatchedCsv: 0,
    };
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "student")
    .eq("is_suspended", false)
    .limit(5000);
  if (error) throw new Error(error.message);

  const wanted = new Set(emails);
  const candidates: CandidateRecipient[] = [];
  for (const row of data ?? []) {
    const email = normalizeEmail(row.email);
    if (!wanted.has(email)) continue;
    candidates.push({
      email,
      fullName: row.full_name,
      profileId: row.id,
    });
    wanted.delete(email);
  }

  const [suppressed, enrolled] = await Promise.all([
    loadSuppressedEmailSet(admin),
    loadEnrolledEmailSet(admin, campaignId),
  ]);
  const preview = filterEnrollmentCandidates({
    source: "csv",
    candidates,
    suppressedEmails: suppressed,
    alreadyEnrolledEmails: enrolled,
  });
  preview.unmatchedCsv = wanted.size;
  return preview;
}

async function previewFromProfileIds(
  admin: Admin,
  campaignId: string,
  source: EnrollmentSource,
  studentIds: string[],
): Promise<SelectionPreview> {
  if (studentIds.length === 0) {
    return {
      source,
      selected: [],
      skippedSynthetic: 0,
      skippedInvalid: 0,
      skippedDuplicate: 0,
      skippedSuppressed: 0,
      skippedAlreadyEnrolled: 0,
      unmatchedCsv: 0,
    };
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", studentIds.slice(0, 5000))
    .eq("role", "student")
    .eq("is_suspended", false);
  if (error) throw new Error(error.message);

  const [suppressed, enrolled] = await Promise.all([
    loadSuppressedEmailSet(admin),
    loadEnrolledEmailSet(admin, campaignId),
  ]);
  return filterEnrollmentCandidates({
    source,
    candidates: (data ?? []).map((row) => ({
      email: row.email,
      fullName: row.full_name,
      profileId: row.id,
    })),
    suppressedEmails: suppressed,
    alreadyEnrolledEmails: enrolled,
  });
}

export async function enrollCandidates(
  admin: Admin,
  campaignId: string,
  candidates: CandidateRecipient[],
): Promise<number> {
  if (candidates.length === 0) return 0;
  const now = new Date().toISOString();
  const rows = candidates.map((row) => ({
    campaign_id: campaignId,
    email: normalizeEmail(row.email),
    profile_id: row.profileId,
    full_name: row.fullName,
    status: "active",
    next_step: 1,
    last_sent_step: 0,
    next_send_at: now,
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_PAGE) {
    const chunk = rows.slice(i, i + INSERT_PAGE);
    const { error: chunkErr, count } = await admin
      .from("email_campaign_recipients" as never)
      .upsert(chunk as never, {
        onConflict: "campaign_id,email",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (!chunkErr) {
      inserted += count ?? chunk.length;
      continue;
    }
    if (!/duplicate|unique/i.test(chunkErr.message)) throw new Error(chunkErr.message);
    for (const row of chunk) {
      const { error: oneErr } = await admin
        .from("email_campaign_recipients" as never)
        .insert(row as never);
      if (!oneErr) inserted += 1;
    }
  }
  return inserted;
}

export async function setCampaignStatus(
  admin: Admin,
  campaignId: string,
  status: CampaignStatus,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "active") {
    patch.activated_at = new Date().toISOString();
    patch.paused_at = null;
  }
  if (status === "paused") patch.paused_at = new Date().toISOString();
  const { error } = await admin
    .from("email_campaigns" as never)
    .update(patch as never)
    .eq("id", campaignId);
  if (error) throw new Error(error.message);
}

export async function suppressAndStopRecipient(
  admin: Admin,
  email: string,
  campaignSlug: string,
  reason: "unsubscribe" | "manual" = "unsubscribe",
): Promise<void> {
  const normalized = normalizeEmail(email);
  const { error: supErr } = await admin.from("email_suppressions" as never).upsert(
    {
      email: normalized,
      reason,
      source: campaignSlug,
    } as never,
    { onConflict: "email" } as never,
  );
  if (supErr && !isMissingRelationError(supErr.message) && !/on conflict/i.test(supErr.message)) {
    const { error: insertErr } = await admin.from("email_suppressions" as never).insert({
      email: normalized,
      reason,
      source: campaignSlug,
    } as never);
    if (insertErr && !/duplicate|unique/i.test(insertErr.message)) {
      throw new Error(insertErr.message);
    }
  }

  const { data: campaign } = await admin
    .from("email_campaigns" as never)
    .select("id")
    .eq("slug", campaignSlug)
    .maybeSingle();
  const campaignId = (campaign as { id?: string } | null)?.id;
  if (!campaignId) return;

  await admin
    .from("email_campaign_recipients" as never)
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    } as never)
    .eq("campaign_id", campaignId)
    .eq("email", normalized)
    .eq("status", "active");
}

export function createSupabaseCampaignStore(admin: Admin): CampaignStore {
  return {
    async getCampaignBySlug(slug) {
      const { data, error } = await admin
        .from("email_campaigns" as never)
        .select("id, slug, name, status, total_steps")
        .eq("slug", slug)
        .maybeSingle();
      if (error) {
        if (isMissingRelationError(error.message)) return null;
        throw new Error(error.message);
      }
      return asCampaign((data as Record<string, unknown> | null) ?? null);
    },

    async listDueRecipients(campaignId, nowIso, limit) {
      const { data, error } = await admin
        .from("email_campaign_recipients" as never)
        .select(
          "id, campaign_id, email, profile_id, full_name, status, next_step, last_sent_step, next_send_at",
        )
        .eq("campaign_id", campaignId)
        .eq("status", "active")
        .lte("next_send_at", nowIso)
        .lte("next_step", AIMONEYCODE_TOTAL_STEPS)
        .order("next_send_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return ((data as Array<Record<string, unknown>> | null) ?? []).map(asRecipient);
    },

    async isEmailSuppressed(email) {
      const { data, error } = await admin
        .from("email_suppressions" as never)
        .select("id")
        .eq("email", normalizeEmail(email))
        .maybeSingle();
      if (error) {
        if (isMissingRelationError(error.message)) return false;
        throw new Error(error.message);
      }
      return Boolean(data);
    },

    async getSend(recipientId, stepNumber) {
      const { data, error } = await admin
        .from("email_campaign_sends" as never)
        .select(
          "id, campaign_id, recipient_id, step_number, idempotency_key, status, attempts, scheduled_at, provider_message_id",
        )
        .eq("recipient_id", recipientId)
        .eq("step_number", stepNumber)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? asSend(data as Record<string, unknown>) : null;
    },

    async insertPendingSend(row) {
      const { error } = await admin.from("email_campaign_sends" as never).insert({
        campaign_id: row.campaignId,
        recipient_id: row.recipientId,
        step_number: row.stepNumber,
        idempotency_key: row.idempotencyKey,
        status: "pending",
        scheduled_at: row.scheduledAt,
      } as never);
      if (!error) return "inserted";
      if (/duplicate|unique/i.test(error.message)) return "exists";
      throw new Error(error.message);
    },

    async claimPendingSends(limit) {
      await admin.rpc("reclaim_stale_email_campaign_sends" as never, {
        p_older_than_minutes: 15,
      } as never);

      const { data: rpcData, error: rpcError } = await admin.rpc(
        "claim_email_campaign_sends" as never,
        { p_limit: limit } as never,
      );
      if (!rpcError && Array.isArray(rpcData)) {
        return (rpcData as Array<Record<string, unknown>>).map(asSend);
      }

      const { data, error } = await admin
        .from("email_campaign_sends" as never)
        .select(
          "id, campaign_id, recipient_id, step_number, idempotency_key, status, attempts, scheduled_at, provider_message_id",
        )
        .eq("status", "pending")
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      const rows = ((data as Array<Record<string, unknown>> | null) ?? []).map(asSend);
      const claimed: SendRecord[] = [];
      for (const row of rows) {
        const { data: updated, error: upErr } = await admin
          .from("email_campaign_sends" as never)
          .update({
            status: "sending",
            attempts: row.attempts + 1,
          } as never)
          .eq("id", row.id)
          .eq("status", "pending")
          .select(
            "id, campaign_id, recipient_id, step_number, idempotency_key, status, attempts, scheduled_at, provider_message_id",
          )
          .maybeSingle();
        if (upErr || !updated) continue;
        claimed.push(asSend(updated as Record<string, unknown>));
      }
      return claimed;
    },

    async markSendResult(row) {
      const patch: Record<string, unknown> = { status: row.status };
      if (row.providerMessageId !== undefined) patch.provider_message_id = row.providerMessageId;
      if (row.lastError !== undefined) patch.last_error = row.lastError;
      if (row.scheduledAt) patch.scheduled_at = row.scheduledAt;
      if (row.status === "sent") patch.sent_at = new Date().toISOString();
      const { error } = await admin
        .from("email_campaign_sends" as never)
        .update(patch as never)
        .eq("id", row.sendId);
      if (error) throw new Error(error.message);
    },

    async markRecipientSent(row) {
      const patch: Record<string, unknown> = {
        last_sent_step: row.stepNumber,
        last_sent_at: row.sentAt,
        next_step: row.nextStep,
        next_send_at: row.nextSendAt,
        last_error: null,
      };
      if (row.completed) {
        patch.status = "completed";
        patch.completed_at = row.sentAt;
      }
      const { error } = await admin
        .from("email_campaign_recipients" as never)
        .update(patch as never)
        .eq("id", row.recipientId);
      if (error) throw new Error(error.message);
    },

    async markRecipientUnsubscribed(recipientId, at) {
      const { error } = await admin
        .from("email_campaign_recipients" as never)
        .update({
          status: "unsubscribed",
          unsubscribed_at: at,
        } as never)
        .eq("id", recipientId);
      if (error) throw new Error(error.message);
    },

    async markRecipientFailed(recipientId, at, errorMessage) {
      const { error } = await admin
        .from("email_campaign_recipients" as never)
        .update({
          status: "failed",
          failed_at: at,
          last_error: errorMessage,
        } as never)
        .eq("id", recipientId);
      if (error) throw new Error(error.message);
    },

    async getRecipient(id) {
      const { data, error } = await admin
        .from("email_campaign_recipients" as never)
        .select(
          "id, campaign_id, email, profile_id, full_name, status, next_step, last_sent_step, next_send_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? asRecipient(data as Record<string, unknown>) : null;
    },
  };
}
