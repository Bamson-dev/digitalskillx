import type { SendEmailResult } from "../email/types";
import { isSyntheticTestRecipient } from "../email/synthetic-recipient";
import {
  MAX_SEND_ATTEMPTS,
  WEBINAR_FOLLOWUP_DRAIN_BUDGET_MS,
  WEBINAR_FOLLOWUP_DRAIN_LIMIT,
  WEBINAR_FOLLOWUP_SEND_CONCURRENCY,
  canProcessCampaign,
  normalizeEmail,
  nextSendAtAfter,
  webinarIdempotencyKey,
  type CampaignStatus,
  type ContactStatus,
  type SendStatus,
} from "./constants";
import type { SequenceEmailContent } from "./render";
import { renderWebinarFollowupEmail } from "./render";
import { listUnsubscribeHeader, unsubscribeApiUrl, unsubscribeUrl } from "../email-campaigns/unsubscribe";

export type WfuCampaign = {
  id: string;
  slug: string;
  name: string;
  status: CampaignStatus;
  total_steps: number;
};

export type WfuContact = {
  id: string;
  campaign_id: string;
  email: string;
  normalized_email: string;
  first_name: string | null;
  status: ContactStatus;
  current_step: number;
  last_sent_step: number;
  next_send_at: string;
};

export type WfuSend = {
  id: string;
  campaign_id: string;
  contact_id: string;
  step_id: string;
  step_number: number;
  idempotency_key: string;
  status: SendStatus;
  attempts: number;
  scheduled_at: string;
  provider_message_id: string | null;
};

export type WfuStep = SequenceEmailContent & {
  id: string;
  status: "active" | "draft" | "retired";
};

export type WfuMailer = (params: {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}) => Promise<SendEmailResult>;

export type WfuStore = {
  listActiveCampaigns(): Promise<WfuCampaign[]>;
  getCampaign(id: string): Promise<WfuCampaign | null>;
  listDueContacts(campaignId: string, nowIso: string, limit: number): Promise<WfuContact[]>;
  getStep(campaignId: string, stepNumber: number): Promise<WfuStep | null>;
  isEmailSuppressed(email: string): Promise<boolean>;
  getSend(contactId: string, stepNumber: number): Promise<WfuSend | null>;
  insertPendingSend(row: {
    campaignId: string;
    contactId: string;
    stepId: string;
    stepNumber: number;
    idempotencyKey: string;
    scheduledAt: string;
  }): Promise<"inserted" | "exists">;
  claimPendingSends(limit: number): Promise<WfuSend[]>;
  markSendResult(params: {
    sendId: string;
    status: Extract<SendStatus, "sent" | "failed" | "skipped" | "pending">;
    providerMessageId?: string | null;
    lastError?: string | null;
    scheduledAt?: string;
  }): Promise<void>;
  markContactSent(params: {
    contactId: string;
    stepNumber: number;
    sentAt: string;
    nextStep: number;
    nextSendAt: string | null;
    completed: boolean;
  }): Promise<void>;
  markContactUnsubscribed(contactId: string, at: string): Promise<void>;
  markContactFailed(contactId: string, at: string, error: string): Promise<void>;
  getContact(id: string): Promise<WfuContact | null>;
};

export type ProcessorResult = {
  campaignsExamined: number;
  examined: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  unsubscribed: number;
  completed: number;
  reason?: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

type SendTickCounts = Pick<
  ProcessorResult,
  "sent" | "failed" | "skipped" | "unsubscribed" | "completed"
>;

async function processClaimedSend(params: {
  store: WfuStore;
  sendEmail: WfuMailer;
  campaign: WfuCampaign;
  send: WfuSend;
  now: Date;
}): Promise<SendTickCounts> {
  const counts: SendTickCounts = {
    sent: 0,
    failed: 0,
    skipped: 0,
    unsubscribed: 0,
    completed: 0,
  };
  const nowIso = params.now.toISOString();

  const contact = await params.store.getContact(params.send.contact_id);
  if (!contact || contact.status !== "active") {
    await params.store.markSendResult({
      sendId: params.send.id,
      status: "skipped",
      lastError: "contact_not_active",
    });
    counts.skipped += 1;
    return counts;
  }

  if (await params.store.isEmailSuppressed(contact.email)) {
    await params.store.markContactUnsubscribed(contact.id, nowIso);
    await params.store.markSendResult({
      sendId: params.send.id,
      status: "skipped",
      lastError: "suppressed",
    });
    counts.unsubscribed += 1;
    return counts;
  }

  if (isSyntheticTestRecipient(contact.email)) {
    await params.store.markSendResult({
      sendId: params.send.id,
      status: "skipped",
      lastError: "synthetic_recipient",
    });
    counts.skipped += 1;
    return counts;
  }

  const step = await params.store.getStep(params.campaign.id, params.send.step_number);
  if (!step || step.status !== "active") {
    await params.store.markSendResult({
      sendId: params.send.id,
      status: "skipped",
      lastError: "step_not_active",
    });
    counts.skipped += 1;
    return counts;
  }

  const unsub = unsubscribeUrl(contact.email, params.campaign.slug);
  const unsubApi = unsubscribeApiUrl(contact.email, params.campaign.slug);
  const rendered = renderWebinarFollowupEmail({
    email: step,
    firstName: contact.first_name,
    campaignSlug: params.campaign.slug,
    unsubscribeUrl: unsub,
  });

  const mail = await params.sendEmail({
    to: normalizeEmail(contact.email),
    subject: rendered.subject,
    html: rendered.html,
    idempotencyKey: params.send.idempotency_key,
    headers: unsubApi ? listUnsubscribeHeader(unsubApi) : undefined,
  });

  if ("messageId" in mail) {
    const completed = params.send.step_number >= params.campaign.total_steps;
    const nextStep = completed ? params.campaign.total_steps + 1 : params.send.step_number + 1;
    const nextStepDef = completed
      ? null
      : await params.store.getStep(params.campaign.id, nextStep);
    const delayHours = nextStepDef?.delayHours ?? 24;
    const nextAt = completed ? null : nextSendAtAfter(params.now, delayHours);

    await params.store.markSendResult({
      sendId: params.send.id,
      status: "sent",
      providerMessageId: mail.messageId,
    });
    await params.store.markContactSent({
      contactId: contact.id,
      stepNumber: params.send.step_number,
      sentAt: params.now.toISOString(),
      nextStep,
      nextSendAt: nextAt?.toISOString() ?? params.now.toISOString(),
      completed,
    });
    counts.sent += 1;
    if (completed) counts.completed += 1;
    return counts;
  }

  if ("skipped" in mail && mail.skipped) {
    await params.store.markSendResult({
      sendId: params.send.id,
      status: "skipped",
      lastError: errorMessage(mail.error),
    });
    counts.skipped += 1;
    return counts;
  }

  const attempts = params.send.attempts;
  const retryable = attempts < MAX_SEND_ATTEMPTS;
  const backoffMin = Math.min(60, 2 ** Math.min(attempts, 5));
  const err = errorMessage(mail.error);
  if (retryable) {
    await params.store.markSendResult({
      sendId: params.send.id,
      status: "pending",
      lastError: err,
      scheduledAt: new Date(params.now.getTime() + backoffMin * 60_000).toISOString(),
    });
  } else {
    await params.store.markSendResult({
      sendId: params.send.id,
      status: "failed",
      lastError: err,
    });
    await params.store.markContactFailed(contact.id, nowIso, err);
  }
  counts.failed += 1;
  return counts;
}

function mergeSendCounts(target: SendTickCounts, delta: SendTickCounts) {
  target.sent += delta.sent;
  target.failed += delta.failed;
  target.skipped += delta.skipped;
  target.unsubscribed += delta.unsubscribed;
  target.completed += delta.completed;
}

async function processOneCampaignTick(params: {
  store: WfuStore;
  sendEmail: WfuMailer;
  campaign: WfuCampaign;
  now: Date;
  limit: number;
}): Promise<ProcessorResult> {
  const nowIso = params.now.toISOString();
  const gate = canProcessCampaign(params.campaign.status);
  if (!gate.ok) {
    return {
      campaignsExamined: 1,
      examined: 0,
      queued: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      unsubscribed: 0,
      completed: 0,
      reason: gate.reason,
    };
  }

  const due = await params.store.listDueContacts(params.campaign.id, nowIso, params.limit);
  let queued = 0;

  for (const contact of due) {
    if (contact.current_step > params.campaign.total_steps) continue;
    const step = await params.store.getStep(params.campaign.id, contact.current_step);
    if (!step || step.status !== "active") continue;

    const existing = await params.store.getSend(contact.id, contact.current_step);
    if (existing?.status === "sent") {
      const completed = existing.step_number >= params.campaign.total_steps;
      const nextStep = completed ? params.campaign.total_steps + 1 : existing.step_number + 1;
      const nextStepDef = completed
        ? null
        : await params.store.getStep(params.campaign.id, nextStep);
      const nextAt = completed
        ? null
        : nextSendAtAfter(params.now, nextStepDef?.delayHours ?? 24);
      await params.store.markContactSent({
        contactId: contact.id,
        stepNumber: existing.step_number,
        sentAt: nowIso,
        nextStep,
        nextSendAt: nextAt?.toISOString() ?? nowIso,
        completed,
      });
      continue;
    }

    const inserted = await params.store.insertPendingSend({
      campaignId: params.campaign.id,
      contactId: contact.id,
      stepId: step.id,
      stepNumber: contact.current_step,
      idempotencyKey: webinarIdempotencyKey(
        params.campaign.id,
        contact.id,
        contact.current_step,
      ),
      scheduledAt: contact.next_send_at,
    });
    if (inserted === "inserted") queued += 1;
  }

  const claimed = await params.store.claimPendingSends(params.limit);
  const result: ProcessorResult = {
    campaignsExamined: 1,
    examined: due.length,
    queued,
    sent: 0,
    failed: 0,
    skipped: 0,
    unsubscribed: 0,
    completed: 0,
  };

  const concurrency = Math.max(1, WEBINAR_FOLLOWUP_SEND_CONCURRENCY);
  for (let i = 0; i < claimed.length; i += concurrency) {
    const chunk = claimed.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((send) =>
        processClaimedSend({
          store: params.store,
          sendEmail: params.sendEmail,
          campaign: params.campaign,
          send,
          now: params.now,
        }),
      ),
    );
    for (const row of chunkResults) mergeSendCounts(result, row);
  }

  if (due.length === 0 && claimed.length === 0) result.reason = "no_due";
  return result;
}

export async function processWebinarFollowupTick(params: {
  store: WfuStore;
  sendEmail: WfuMailer;
  now?: Date;
  limit?: number;
  campaignId?: string;
}): Promise<ProcessorResult> {
  const now = params.now ?? new Date();
  const limit = Math.max(1, Math.min(params.limit ?? WEBINAR_FOLLOWUP_DRAIN_LIMIT, 100));
  const campaigns = params.campaignId
    ? ([await params.store.getCampaign(params.campaignId)].filter(Boolean) as WfuCampaign[])
    : await params.store.listActiveCampaigns();

  const acc: ProcessorResult = {
    campaignsExamined: 0,
    examined: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    unsubscribed: 0,
    completed: 0,
  };

  if (campaigns.length === 0) {
    return { ...acc, reason: "no_active_campaigns" };
  }

  for (const campaign of campaigns) {
    const result = await processOneCampaignTick({
      store: params.store,
      sendEmail: params.sendEmail,
      campaign,
      now,
      limit,
    });
    acc.campaignsExamined += result.campaignsExamined;
    acc.examined += result.examined;
    acc.queued += result.queued;
    acc.sent += result.sent;
    acc.failed += result.failed;
    acc.skipped += result.skipped;
    acc.unsubscribed += result.unsubscribed;
    acc.completed += result.completed;
    acc.reason = result.reason;
  }

  return acc;
}

export type DrainResult = ProcessorResult & { ticks: number; moreDue: boolean };

export async function drainWebinarFollowupUntilBudget(params: {
  store: WfuStore;
  sendEmail: WfuMailer;
  now?: Date;
  limit?: number;
  budgetMs?: number;
  campaignId?: string;
}): Promise<DrainResult> {
  const budgetMs = Math.max(1_000, params.budgetMs ?? WEBINAR_FOLLOWUP_DRAIN_BUDGET_MS);
  const limit = Math.max(1, Math.min(params.limit ?? WEBINAR_FOLLOWUP_DRAIN_LIMIT, 100));
  const started = Date.now();
  const acc: DrainResult = {
    campaignsExamined: 0,
    examined: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    unsubscribed: 0,
    completed: 0,
    ticks: 0,
    moreDue: false,
  };

  while (Date.now() - started < budgetMs) {
    const result = await processWebinarFollowupTick({
      store: params.store,
      sendEmail: params.sendEmail,
      now: params.now,
      limit,
      campaignId: params.campaignId,
    });
    acc.ticks += 1;
    acc.campaignsExamined += result.campaignsExamined;
    acc.examined += result.examined;
    acc.queued += result.queued;
    acc.sent += result.sent;
    acc.failed += result.failed;
    acc.skipped += result.skipped;
    acc.unsubscribed += result.unsubscribed;
    acc.completed += result.completed;
    acc.reason = result.reason;

    if (result.reason === "no_active_campaigns" || result.reason === "draft" || result.reason === "paused" || result.reason === "archived") {
      acc.moreDue = false;
      break;
    }
    if (result.reason === "no_due") {
      acc.moreDue = false;
      break;
    }
    const progressed =
      result.sent > 0 || result.queued > 0 || result.failed > 0 || result.skipped > 0;
    if (!progressed) {
      acc.moreDue = result.examined > 0;
      break;
    }
    acc.moreDue = true;
  }

  return acc;
}
