import type { SendEmailResult } from "../email/types";
import { isSyntheticTestRecipient } from "../email/synthetic-recipient";
import {
  AIMONEYCODE_CAMPAIGN_SLUG,
  AIMONEYCODE_TOTAL_STEPS,
  MAX_SEND_ATTEMPTS,
  campaignIdempotencyKey,
  canProcessCampaign,
  nextSendAtAfter,
  normalizeEmail,
  type CampaignStatus,
  type RecipientStatus,
  type SendStatus,
} from "./constants";
import { getAimoneycodeEmail } from "./sequence";
import { renderCampaignEmailHtml } from "./render";
import { listUnsubscribeHeader, unsubscribeApiUrl, unsubscribeUrl } from "./unsubscribe";

export type CampaignRecord = {
  id: string;
  slug: string;
  name: string;
  status: CampaignStatus;
  total_steps: number;
};

export type RecipientRecord = {
  id: string;
  campaign_id: string;
  email: string;
  profile_id: string | null;
  full_name: string | null;
  status: RecipientStatus;
  next_step: number;
  last_sent_step: number;
  next_send_at: string;
};

export type SendRecord = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  step_number: number;
  idempotency_key: string;
  status: SendStatus;
  attempts: number;
  scheduled_at: string;
  provider_message_id: string | null;
};

export type CampaignMailer = (params: {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}) => Promise<SendEmailResult>;

export type CampaignStore = {
  getCampaignBySlug(slug: string): Promise<CampaignRecord | null>;
  listDueRecipients(campaignId: string, nowIso: string, limit: number): Promise<RecipientRecord[]>;
  isEmailSuppressed(email: string): Promise<boolean>;
  getSend(recipientId: string, stepNumber: number): Promise<SendRecord | null>;
  insertPendingSend(row: {
    campaignId: string;
    recipientId: string;
    stepNumber: number;
    idempotencyKey: string;
    scheduledAt: string;
  }): Promise<"inserted" | "exists">;
  claimPendingSends(limit: number): Promise<SendRecord[]>;
  markSendResult(params: {
    sendId: string;
    status: Extract<SendStatus, "sent" | "failed" | "skipped" | "pending">;
    providerMessageId?: string | null;
    lastError?: string | null;
    scheduledAt?: string;
  }): Promise<void>;
  markRecipientSent(params: {
    recipientId: string;
    stepNumber: number;
    sentAt: string;
    nextStep: number;
    nextSendAt: string | null;
    completed: boolean;
  }): Promise<void>;
  markRecipientUnsubscribed(recipientId: string, at: string): Promise<void>;
  markRecipientFailed(recipientId: string, at: string, error: string): Promise<void>;
  getRecipient(id: string): Promise<RecipientRecord | null>;
};

export type ProcessorResult = {
  campaignStatus: CampaignStatus | "missing";
  examined: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  unsubscribed: number;
  completed: number;
  reason?: "draft" | "paused" | "missing" | "no_due";
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function processAimoneycodeCampaignTick(params: {
  store: CampaignStore;
  sendEmail: CampaignMailer;
  now?: Date;
  limit?: number;
  slug?: string;
}): Promise<ProcessorResult> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
  const slug = params.slug ?? AIMONEYCODE_CAMPAIGN_SLUG;

  const campaign = await params.store.getCampaignBySlug(slug);
  if (!campaign) {
    return {
      campaignStatus: "missing",
      examined: 0,
      queued: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      unsubscribed: 0,
      completed: 0,
      reason: "missing",
    };
  }

  const gate = canProcessCampaign(campaign.status);
  if (!gate.ok) {
    return {
      campaignStatus: campaign.status,
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

  const due = await params.store.listDueRecipients(campaign.id, nowIso, limit);
  let queued = 0;
  for (const recipient of due) {
    if (recipient.next_step > AIMONEYCODE_TOTAL_STEPS) continue;
    const existing = await params.store.getSend(recipient.id, recipient.next_step);
    if (existing?.status === "sent") {
      const completed = existing.step_number >= AIMONEYCODE_TOTAL_STEPS;
      const nextStep = completed ? AIMONEYCODE_TOTAL_STEPS + 1 : existing.step_number + 1;
      const sentAt = new Date(nowIso);
      const nextAt = nextSendAtAfter(sentAt, existing.step_number);
      await params.store.markRecipientSent({
        recipientId: recipient.id,
        stepNumber: existing.step_number,
        sentAt: nowIso,
        nextStep,
        nextSendAt: nextAt?.toISOString() ?? nowIso,
        completed,
      });
      continue;
    }
    const inserted = await params.store.insertPendingSend({
      campaignId: campaign.id,
      recipientId: recipient.id,
      stepNumber: recipient.next_step,
      idempotencyKey: campaignIdempotencyKey(campaign.id, recipient.id, recipient.next_step),
      scheduledAt: recipient.next_send_at,
    });
    if (inserted === "inserted") queued += 1;
  }

  const claimed = await params.store.claimPendingSends(limit);
  const result: ProcessorResult = {
    campaignStatus: campaign.status,
    examined: due.length,
    queued,
    sent: 0,
    failed: 0,
    skipped: 0,
    unsubscribed: 0,
    completed: 0,
  };

  for (const send of claimed) {
    const recipient = await params.store.getRecipient(send.recipient_id);
    if (!recipient || recipient.status !== "active") {
      await params.store.markSendResult({
        sendId: send.id,
        status: "skipped",
        lastError: "recipient_not_active",
      });
      result.skipped += 1;
      continue;
    }

    if (await params.store.isEmailSuppressed(recipient.email)) {
      await params.store.markRecipientUnsubscribed(recipient.id, nowIso);
      await params.store.markSendResult({
        sendId: send.id,
        status: "skipped",
        lastError: "suppressed",
      });
      result.unsubscribed += 1;
      continue;
    }

    if (isSyntheticTestRecipient(recipient.email)) {
      await params.store.markSendResult({
        sendId: send.id,
        status: "skipped",
        lastError: "synthetic_recipient",
      });
      result.skipped += 1;
      continue;
    }

    const step = send.step_number;
    const email = getAimoneycodeEmail(step);
    const unsub = unsubscribeUrl(recipient.email, AIMONEYCODE_CAMPAIGN_SLUG);
    const unsubApi = unsubscribeApiUrl(recipient.email, AIMONEYCODE_CAMPAIGN_SLUG);
    const rendered = renderCampaignEmailHtml({
      email,
      stepNumber: step,
      fullName: recipient.full_name,
      unsubscribeUrl: unsub,
    });

    const mail = await params.sendEmail({
      to: normalizeEmail(recipient.email),
      subject: rendered.subject,
      html: rendered.html,
      idempotencyKey: send.idempotency_key,
      headers: unsubApi ? listUnsubscribeHeader(unsubApi) : undefined,
    });

    if ("messageId" in mail) {
      const sentAt = now;
      const completed = step >= AIMONEYCODE_TOTAL_STEPS;
      const nextStep = completed ? AIMONEYCODE_TOTAL_STEPS + 1 : step + 1;
      const nextAt = nextSendAtAfter(sentAt, step);
      await params.store.markSendResult({
        sendId: send.id,
        status: "sent",
        providerMessageId: mail.messageId,
      });
      await params.store.markRecipientSent({
        recipientId: recipient.id,
        stepNumber: step,
        sentAt: sentAt.toISOString(),
        nextStep,
        nextSendAt: nextAt?.toISOString() ?? sentAt.toISOString(),
        completed,
      });
      result.sent += 1;
      if (completed) result.completed += 1;
      continue;
    }

    if ("skipped" in mail && mail.skipped) {
      await params.store.markSendResult({
        sendId: send.id,
        status: "skipped",
        lastError: errorMessage(mail.error),
      });
      result.skipped += 1;
      continue;
    }

    const attempts = send.attempts;
    const retryable = attempts < MAX_SEND_ATTEMPTS;
    const backoffMin = Math.min(60, 2 ** Math.min(attempts, 5));
    const err = errorMessage(mail.error);
    if (retryable) {
      await params.store.markSendResult({
        sendId: send.id,
        status: "pending",
        lastError: err,
        scheduledAt: new Date(now.getTime() + backoffMin * 60_000).toISOString(),
      });
    } else {
      await params.store.markSendResult({
        sendId: send.id,
        status: "failed",
        lastError: err,
      });
      await params.store.markRecipientFailed(recipient.id, nowIso, err);
    }
    result.failed += 1;
  }

  if (due.length === 0 && claimed.length === 0) result.reason = "no_due";
  return result;
}
