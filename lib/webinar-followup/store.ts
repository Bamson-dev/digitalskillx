import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isSyntheticTestRecipient } from "@/lib/email/synthetic-recipient";
import {
  normalizeEmail,
  STALE_SENDING_MINUTES,
  WEBINAR_FOLLOWUP_REQUIRED_STEPS,
  lagosDayStartUtc,
  type CampaignStatus,
  type ContactStatus,
  type SendStatus,
} from "./constants";
import type { CsvDryRunReport, ParsedCsvContact } from "./csv";
import { buildDryRunReport } from "./csv";
import type { SequenceEmailContent } from "./render";
import type { WfuCampaign, WfuContact, WfuSend, WfuStep, WfuStore } from "./processor";
import { encodeStepBodyHtml, parseStepMeta, stripStepMeta } from "./step-meta";
import { assertValidWebinarSequence } from "./validate-sequence";

type Admin = SupabaseClient<Database>;

function isMissingRelationError(message: string): boolean {
  return /schema cache|does not exist|could not find the table|relation .* does not exist/i.test(
    message,
  );
}

function asCampaign(row: Record<string, unknown> | null): WfuCampaign | null {
  if (!row) return null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    status: row.status as CampaignStatus,
    total_steps: Number(row.total_steps ?? 0),
  };
}

function asContact(row: Record<string, unknown>): WfuContact {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    email: String(row.email),
    normalized_email: String(row.normalized_email),
    first_name: (row.first_name as string | null) ?? null,
    status: row.status as ContactStatus,
    current_step: Number(row.current_step ?? 1),
    last_sent_step: Number(row.last_sent_step ?? 0),
    next_send_at: String(row.next_send_at),
  };
}

function asSend(row: Record<string, unknown>): WfuSend {
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    contact_id: String(row.contact_id),
    step_id: String(row.step_id),
    step_number: Number(row.step_number),
    idempotency_key: String(row.idempotency_key),
    status: row.status as SendStatus,
    attempts: Number(row.attempts ?? 0),
    scheduled_at: String(row.scheduled_at),
    provider_message_id: (row.provider_message_id as string | null) ?? null,
  };
}

function asStep(row: Record<string, unknown>): WfuStep {
  const bodyHtml = String(row.body_html ?? "");
  const meta = parseStepMeta(bodyHtml);
  const bodyText = String(row.body_text || stripStepMeta(bodyHtml) || "");
  return {
    id: String(row.id),
    stepNumber: Number(row.step_number),
    internalTitle: String(row.internal_title ?? ""),
    subject: String(row.subject),
    altSubjects: meta?.altSubjects ?? ["", ""],
    angle: meta?.angle ?? "",
    category: meta?.category ?? "",
    previewText: String(row.preview_text ?? ""),
    bodyText,
    ctaLabel: String(row.cta_label ?? "See The Full Offer"),
    ctaUrl: String(row.cta_url),
    delayHours: Number(row.delay_hours ?? 24),
    status: row.status as WfuStep["status"],
  };
}

export type CampaignCounts = {
  total: number;
  active: number;
  waiting: number;
  completed: number;
  unsubscribed: number;
  failed: number;
  paused: number;
  sent: number;
  sending: number;
  sendFailed: number;
  dueNow: number;
  nextScheduledAt: string | null;
  sentToday: number;
  lastSentAt: string | null;
};

export type CampaignSnapshot = {

export type CampaignSnapshot = {
  migrationRequired: boolean;
  campaign: (WfuCampaign & {
    description: string;
    offer_url: string;
    offer_price_label: string;
    offer_value_label: string;
    created_at: string;
    updated_at: string;
  }) | null;
  counts: CampaignCounts;
};

const emptyCounts = (): CampaignCounts => ({
  total: 0,
  active: 0,
  waiting: 0,
  completed: 0,
  unsubscribed: 0,
  failed: 0,
  paused: 0,
  sent: 0,
  sending: 0,
  sendFailed: 0,
  dueNow: 0,
  nextScheduledAt: null,
  sentToday: 0,
  lastSentAt: null,
});

export async function listWebinarCampaigns(admin: Admin): Promise<{
  migrationRequired: boolean;
  campaigns: Array<WfuCampaign & { description: string; updated_at: string; counts: CampaignCounts }>;
}> {
  const { data, error } = await admin
    .from("webinar_followup_campaigns" as never)
    .select("id, slug, name, description, status, total_steps, updated_at")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingRelationError(error.message)) {
      return { migrationRequired: true, campaigns: [] };
    }
    throw new Error(error.message);
  }
  const rows = (data as Array<Record<string, unknown>> | null) ?? [];
  const campaigns = [];
  for (const row of rows) {
    const base = asCampaign(row)!;
    const counts = await loadCampaignCounts(admin, base.id);
    campaigns.push({
      ...base,
      description: String(row.description ?? ""),
      updated_at: String(row.updated_at),
      counts,
    });
  }
  return { migrationRequired: false, campaigns };
}

export async function loadCampaignSnapshot(
  admin: Admin,
  campaignIdOrSlug: string,
): Promise<CampaignSnapshot> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      campaignIdOrSlug,
    );
  let query = admin
    .from("webinar_followup_campaigns" as never)
    .select(
      "id, slug, name, description, status, total_steps, offer_url, offer_price_label, offer_value_label, created_at, updated_at",
    );
  query = uuid ? query.eq("id", campaignIdOrSlug) : query.eq("slug", campaignIdOrSlug);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message)) {
      return { migrationRequired: true, campaign: null, counts: emptyCounts() };
    }
    throw new Error(error.message);
  }
  if (!data) return { migrationRequired: false, campaign: null, counts: emptyCounts() };
  const row = data as Record<string, unknown>;
  const campaign = asCampaign(row)!;
  const counts = await loadCampaignCounts(admin, campaign.id);
  return {
    migrationRequired: false,
    campaign: {
      ...campaign,
      description: String(row.description ?? ""),
      offer_url: String(row.offer_url),
      offer_price_label: String(row.offer_price_label),
      offer_value_label: String(row.offer_value_label),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    },
    counts,
  };
}

export async function loadCampaignCounts(admin: Admin, campaignId: string): Promise<CampaignCounts> {
  const counts = emptyCounts();
  const { data: contacts, error } = await admin
    .from("webinar_followup_contacts" as never)
    .select("status, next_send_at")
    .eq("campaign_id", campaignId);
  if (error) {
    if (isMissingRelationError(error.message)) return counts;
    throw new Error(error.message);
  }
  const now = Date.now();
  let next: string | null = null;
  for (const row of (contacts as Array<{ status: string; next_send_at: string }> | null) ?? []) {
    counts.total += 1;
    if (row.status === "active") {
      counts.active += 1;
      const t = new Date(row.next_send_at).getTime();
      if (t <= now) counts.dueNow += 1;
      else if (!next || row.next_send_at < next) next = row.next_send_at;
    } else if (row.status === "waiting") counts.waiting += 1;
    else if (row.status === "completed") counts.completed += 1;
    else if (row.status === "unsubscribed") counts.unsubscribed += 1;
    else if (row.status === "failed") counts.failed += 1;
    else if (row.status === "paused") counts.paused += 1;
  }
  counts.nextScheduledAt = next;

  const countExact = async (status: string) => {
    const { count, error: countError } = await admin
      .from("webinar_followup_sends" as never)
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", status);
    if (countError) return 0;
    return count ?? 0;
  };
  counts.sent = await countExact("sent");
  counts.sending = await countExact("sending");
  counts.sendFailed = await countExact("failed");

  const dayStart = lagosDayStartUtc().toISOString();
  const { count: sentToday } = await admin
    .from("webinar_followup_sends" as never)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "sent")
    .gte("sent_at", dayStart);
  counts.sentToday = sentToday ?? 0;

  const { data: lastSent } = await admin
    .from("webinar_followup_sends" as never)
    .select("sent_at")
    .eq("campaign_id", campaignId)
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  counts.lastSentAt = lastSent ? String((lastSent as { sent_at: string }).sent_at) : null;

  return counts;
}

export async function listSequenceSteps(admin: Admin, campaignId: string): Promise<WfuStep[]> {
  const { data, error } = await admin
    .from("webinar_followup_sequence_steps" as never)
    .select(
      "id, step_number, internal_title, subject, preview_text, body_html, body_text, cta_label, cta_url, delay_hours, status",
    )
    .eq("campaign_id", campaignId)
    .order("step_number", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Array<Record<string, unknown>> | null) ?? []).map(asStep);
}

export async function seedSequenceSteps(
  admin: Admin,
  campaignId: string,
  emails: SequenceEmailContent[],
): Promise<number> {
  const validated = assertValidWebinarSequence(emails);
  const rows = validated.map((email) => ({
    campaign_id: campaignId,
    step_number: email.stepNumber,
    internal_title: email.internalTitle,
    subject: email.subject,
    preview_text: email.previewText,
    body_html: encodeStepBodyHtml(email),
    body_text: email.bodyText,
    cta_label: email.ctaLabel,
    cta_url: email.ctaUrl,
    delay_hours: email.delayHours,
    status: "active",
  }));
  const { error } = await admin.from("webinar_followup_sequence_steps" as never).upsert(rows as never, {
    onConflict: "campaign_id,step_number",
  } as never);
  if (error) throw new Error(error.message);
  await admin
    .from("webinar_followup_campaigns" as never)
    .update({ total_steps: WEBINAR_FOLLOWUP_REQUIRED_STEPS } as never)
    .eq("id", campaignId);
  return validated.length;
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
  if (status === "archived") patch.archived_at = new Date().toISOString();
  const { error } = await admin
    .from("webinar_followup_campaigns" as never)
    .update(patch as never)
    .eq("id", campaignId);
  if (error) throw new Error(error.message);
}

export async function listSuppressedEmails(
  admin: Admin,
  emails: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (emails.length === 0) return set;
  const chunk = 500;
  for (let i = 0; i < emails.length; i += chunk) {
    const slice = emails.slice(i, i + chunk).map(normalizeEmail);
    const { data, error } = await admin
      .from("email_suppressions" as never)
      .select("email")
      .in("email", slice);
    if (error) {
      if (isMissingRelationError(error.message)) return set;
      throw new Error(error.message);
    }
    for (const row of (data as Array<{ email: string }> | null) ?? []) {
      set.add(normalizeEmail(row.email));
    }
  }
  return set;
}

export async function listCampaignEmails(
  admin: Admin,
  campaignId: string,
  emails: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (emails.length === 0) return set;
  const chunk = 500;
  for (let i = 0; i < emails.length; i += chunk) {
    const slice = emails.slice(i, i + chunk).map(normalizeEmail);
    const { data, error } = await admin
      .from("webinar_followup_contacts" as never)
      .select("normalized_email")
      .eq("campaign_id", campaignId)
      .in("normalized_email", slice);
    if (error) throw new Error(error.message);
    for (const row of (data as Array<{ normalized_email: string }> | null) ?? []) {
      set.add(normalizeEmail(row.normalized_email));
    }
  }
  return set;
}

export async function importNewContactsOneShot(params: {
  admin: Admin;
  campaignId: string;
  fileName: string;
  uploadedBy: string | null;
  totalRows: number;
  contacts: ParsedCsvContact[];
  invalidCount: number;
  duplicatesInFile: number;
  campaignStatus: CampaignStatus;
}): Promise<{
  importId: string;
  report: CsvDryRunReport;
  enrolled: number;
  skippedExisting: number;
  skippedSuppressed: number;
  skippedInvalid: number;
  duplicatesInFile: number;
}> {
  if (params.campaignStatus === "archived") {
    throw new Error("This campaign is archived. Restore it before importing new contacts.");
  }

  const emails = params.contacts.map((c) => c.normalizedEmail);
  const [already, suppressed] = await Promise.all([
    listCampaignEmails(params.admin, params.campaignId, emails),
    listSuppressedEmails(params.admin, emails),
  ]);

  const report = buildDryRunReport({
    totalRows: params.totalRows,
    contacts: params.contacts,
    invalidCount: params.invalidCount,
    duplicatesInFile: params.duplicatesInFile,
    alreadyInCampaign: already,
    suppressed,
  });

  const { data: importRow, error: importErr } = await params.admin
    .from("webinar_followup_imports" as never)
    .insert({
      campaign_id: params.campaignId,
      file_name: params.fileName.slice(0, 240),
      uploaded_by: params.uploadedBy,
      status: "confirmed",
      total_rows: params.totalRows,
      valid_emails: params.contacts.length,
      invalid_emails: params.invalidCount,
      duplicates_in_file: params.duplicatesInFile,
      already_in_campaign: report.alreadyInCampaign,
      suppressed: report.suppressed,
      newly_enrolled: 0,
      report,
      confirmed_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (importErr) throw new Error(importErr.message);
  const importId = String((importRow as { id: string }).id);

  const result = await confirmImportEnrollment({
    admin: params.admin,
    importId,
    campaignId: params.campaignId,
    contacts: params.contacts,
  });

  return {
    importId,
    report: { ...report, willEnroll: result.enrolled, eligibleNew: result.enrolled },
    enrolled: result.enrolled,
    skippedExisting: report.alreadyInCampaign,
    skippedSuppressed: report.suppressed,
    skippedInvalid: params.invalidCount,
    duplicatesInFile: params.duplicatesInFile,
  };
}

export async function confirmImportEnrollment(params: {
  admin: Admin;
  importId: string;
  campaignId: string;
  contacts: ParsedCsvContact[];
}): Promise<{ enrolled: number; skipped: number }> {
  const suppressed = await listSuppressedEmails(
    params.admin,
    params.contacts.map((c) => c.normalizedEmail),
  );
  const existing = await listCampaignEmails(
    params.admin,
    params.campaignId,
    params.contacts.map((c) => c.normalizedEmail),
  );

  const toInsert = params.contacts.filter(
    (c) =>
      !suppressed.has(c.normalizedEmail) &&
      !existing.has(c.normalizedEmail) &&
      !isSyntheticTestRecipient(c.normalizedEmail),
  );

  let enrolled = 0;
  const now = new Date().toISOString();
  const chunk = 100;
  for (let i = 0; i < toInsert.length; i += chunk) {
    const slice = toInsert.slice(i, i + chunk).map((c) => ({
      campaign_id: params.campaignId,
      email: c.normalizedEmail,
      normalized_email: c.normalizedEmail,
      first_name: c.firstName,
      status: "active",
      current_step: 1,
      last_sent_step: 0,
      enrolled_at: now,
      next_send_at: now,
      source_import_id: params.importId,
    }));
    const { error, data } = await params.admin
      .from("webinar_followup_contacts" as never)
      .upsert(slice as never, {
        onConflict: "campaign_id,normalized_email",
        ignoreDuplicates: true,
      } as never)
      .select("id");
    if (error) {
      // Fallback: insert one-by-one when upsert ignore not supported
      for (const row of slice) {
        const { error: oneErr } = await params.admin
          .from("webinar_followup_contacts" as never)
          .insert(row as never);
        if (!oneErr) enrolled += 1;
        else if (!/duplicate|unique/i.test(oneErr.message)) throw new Error(oneErr.message);
      }
      continue;
    }
    enrolled += ((data as unknown[] | null) ?? []).length;
  }

  const skipped = params.contacts.length - enrolled;
  await params.admin
    .from("webinar_followup_imports" as never)
    .update({
      status: "confirmed",
      newly_enrolled: enrolled,
      confirmed_at: now,
    } as never)
    .eq("id", params.importId)
    .eq("campaign_id", params.campaignId);

  return { enrolled, skipped };
}

export async function listImports(admin: Admin, campaignId: string) {
  const { data, error } = await admin
    .from("webinar_followup_imports" as never)
    .select(
      "id, file_name, status, total_rows, valid_emails, invalid_emails, duplicates_in_file, already_in_campaign, suppressed, newly_enrolled, created_at, confirmed_at",
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

export async function listContactsPage(
  admin: Admin,
  campaignId: string,
  limit = 50,
) {
  const { data, error } = await admin
    .from("webinar_followup_contacts" as never)
    .select(
      "id, email, first_name, status, current_step, last_sent_step, enrolled_at, last_sent_at, next_send_at, completed_at",
    )
    .eq("campaign_id", campaignId)
    .order("enrolled_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

export async function listRecentSends(admin: Admin, campaignId: string, limit = 40) {
  const { data, error } = await admin
    .from("webinar_followup_sends" as never)
    .select(
      "id, contact_id, step_number, status, attempts, provider_message_id, last_error, sent_at, scheduled_at, created_at, updated_at",
    )
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

export async function listSendsByStep(admin: Admin, campaignId: string) {
  const { data, error } = await admin
    .from("webinar_followup_sends" as never)
    .select("step_number, status")
    .eq("campaign_id", campaignId)
    .eq("status", "sent");
  if (error) throw new Error(error.message);
  const map = new Map<number, number>();
  for (const row of (data as Array<{ step_number: number }> | null) ?? []) {
    map.set(row.step_number, (map.get(row.step_number) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, count]) => ({ step, count }));
}

export async function suppressWebinarContact(
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
      source: `wfu:${campaignSlug}`,
    } as never,
    { onConflict: "email" } as never,
  );
  if (supErr && !isMissingRelationError(supErr.message) && !/on conflict/i.test(supErr.message)) {
    const { error: insertErr } = await admin.from("email_suppressions" as never).insert({
      email: normalized,
      reason,
      source: `wfu:${campaignSlug}`,
    } as never);
    if (insertErr && !/duplicate|unique/i.test(insertErr.message)) {
      throw new Error(insertErr.message);
    }
  }

  const { data: campaign } = await admin
    .from("webinar_followup_campaigns" as never)
    .select("id")
    .eq("slug", campaignSlug)
    .maybeSingle();
  const campaignId = (campaign as { id?: string } | null)?.id;
  if (!campaignId) return;

  await admin
    .from("webinar_followup_contacts" as never)
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    } as never)
    .eq("campaign_id", campaignId)
    .eq("normalized_email", normalized)
    .in("status", ["active", "waiting", "paused"]);
}

export function createSupabaseWfuStore(admin: Admin): WfuStore {
  return {
    async listActiveCampaigns() {
      const { data, error } = await admin
        .from("webinar_followup_campaigns" as never)
        .select("id, slug, name, status, total_steps")
        .eq("status", "active");
      if (error) {
        if (isMissingRelationError(error.message)) return [];
        throw new Error(error.message);
      }
      return ((data as Array<Record<string, unknown>> | null) ?? [])
        .map(asCampaign)
        .filter(Boolean) as WfuCampaign[];
    },

    async getCampaign(id) {
      const { data, error } = await admin
        .from("webinar_followup_campaigns" as never)
        .select("id, slug, name, status, total_steps")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return asCampaign((data as Record<string, unknown> | null) ?? null);
    },

    async listDueContacts(campaignId, nowIso, limit) {
      const fetchLimit = Math.min(Math.max(limit * 8, limit), 400);
      const { data, error } = await admin
        .from("webinar_followup_contacts" as never)
        .select(
          "id, campaign_id, email, normalized_email, first_name, status, current_step, last_sent_step, next_send_at",
        )
        .eq("campaign_id", campaignId)
        .eq("status", "active")
        .lte("next_send_at", nowIso)
        .order("next_send_at", { ascending: true })
        .limit(fetchLimit);
      if (error) throw new Error(error.message);
      const due = ((data as Array<Record<string, unknown>> | null) ?? []).map(asContact);
      if (due.length === 0) return [];

      const { data: inFlight, error: sendErr } = await admin
        .from("webinar_followup_sends" as never)
        .select("contact_id")
        .eq("campaign_id", campaignId)
        .in("status", ["pending", "sending"]);
      if (sendErr) throw new Error(sendErr.message);
      const blocked = new Set(
        ((inFlight as Array<{ contact_id: string }> | null) ?? []).map((row) => row.contact_id),
      );
      return due.filter((row) => !blocked.has(row.id)).slice(0, limit);
    },

    async getStep(campaignId, stepNumber) {
      const { data, error } = await admin
        .from("webinar_followup_sequence_steps" as never)
        .select(
          "id, step_number, internal_title, subject, preview_text, body_html, body_text, cta_label, cta_url, delay_hours, status",
        )
        .eq("campaign_id", campaignId)
        .eq("step_number", stepNumber)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? asStep(data as Record<string, unknown>) : null;
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

    async getSend(contactId, stepNumber) {
      const { data, error } = await admin
        .from("webinar_followup_sends" as never)
        .select(
          "id, campaign_id, contact_id, step_id, step_number, idempotency_key, status, attempts, scheduled_at, provider_message_id",
        )
        .eq("contact_id", contactId)
        .eq("step_number", stepNumber)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? asSend(data as Record<string, unknown>) : null;
    },

    async insertPendingSend(row) {
      const { error } = await admin.from("webinar_followup_sends" as never).insert({
        campaign_id: row.campaignId,
        contact_id: row.contactId,
        step_id: row.stepId,
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
      await admin.rpc("reclaim_stale_webinar_followup_sends" as never, {
        p_older_than_minutes: STALE_SENDING_MINUTES,
      } as never);

      const { data: rpcData, error: rpcError } = await admin.rpc(
        "claim_webinar_followup_sends" as never,
        { p_limit: limit } as never,
      );
      if (!rpcError && Array.isArray(rpcData)) {
        return (rpcData as Array<Record<string, unknown>>).map(asSend);
      }

      const { data, error } = await admin
        .from("webinar_followup_sends" as never)
        .select(
          "id, campaign_id, contact_id, step_id, step_number, idempotency_key, status, attempts, scheduled_at, provider_message_id",
        )
        .eq("status", "pending")
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      const rows = ((data as Array<Record<string, unknown>> | null) ?? []).map(asSend);
      const claimed: WfuSend[] = [];
      for (const row of rows) {
        const { data: updated, error: upErr } = await admin
          .from("webinar_followup_sends" as never)
          .update({
            status: "sending",
            attempts: row.attempts + 1,
          } as never)
          .eq("id", row.id)
          .eq("status", "pending")
          .select(
            "id, campaign_id, contact_id, step_id, step_number, idempotency_key, status, attempts, scheduled_at, provider_message_id",
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
        .from("webinar_followup_sends" as never)
        .update(patch as never)
        .eq("id", row.sendId);
      if (error) throw new Error(error.message);
    },

    async markContactSent(row) {
      const patch: Record<string, unknown> = {
        last_sent_step: row.stepNumber,
        last_sent_at: row.sentAt,
        current_step: row.nextStep,
        next_send_at: row.nextSendAt ?? row.sentAt,
      };
      if (row.completed) {
        patch.status = "completed";
        patch.completed_at = row.sentAt;
      }
      const { error } = await admin
        .from("webinar_followup_contacts" as never)
        .update(patch as never)
        .eq("id", row.contactId);
      if (error) throw new Error(error.message);
    },

    async markContactUnsubscribed(contactId, at) {
      const { error } = await admin
        .from("webinar_followup_contacts" as never)
        .update({
          status: "unsubscribed",
          unsubscribed_at: at,
        } as never)
        .eq("id", contactId);
      if (error) throw new Error(error.message);
    },

    async markContactFailed(contactId, at, errorMsg) {
      const { error } = await admin
        .from("webinar_followup_contacts" as never)
        .update({
          status: "failed",
          failed_at: at,
          last_error: errorMsg,
        } as never)
        .eq("id", contactId);
      if (error) throw new Error(error.message);
    },

    async getContact(id) {
      const { data, error } = await admin
        .from("webinar_followup_contacts" as never)
        .select(
          "id, campaign_id, email, normalized_email, first_name, status, current_step, last_sent_step, next_send_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? asContact(data as Record<string, unknown>) : null;
    },
  };
}
