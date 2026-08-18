#!/usr/bin/env node
/**
 * Offline AI Money Code 30-day campaign tests — no live sends, no DB writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = (rel) => pathToFileURL(join(root, rel)).href;

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

const {
  AIMONEYCODE_TOTAL_STEPS,
  WEBINAR_CTA_URL,
  OFFER_CTA_URL,
  ctaUrlForStep,
  canProcessCampaign,
  nextSendAtAfter,
  campaignIdempotencyKey,
  normalizeEmail,
} = await import(ts("lib/email-campaigns/constants.ts"));
const { parseAimoneycodeSequence, assertCompleteSequence } = await import(
  ts("lib/email-campaigns/parse-sequence.ts")
);
const { applyCampaignGreeting, campaignGreeting } = await import(
  ts("lib/email-campaigns/greeting.ts")
);
const { filterEnrollmentCandidates, extractEmailsFromCsv } =
  await import(ts("lib/email-campaigns/selection.ts"));
const { renderCampaignEmailHtml } = await import(ts("lib/email-campaigns/render.ts"));
const { processAimoneycodeCampaignTick } = await import(
  ts("lib/email-campaigns/processor.ts")
);
const { loadAimoneycodeSequence } = await import(ts("lib/email-campaigns/sequence.ts"));

const markdown = readFileSync(
  join(root, "content/aimoneycode-30-day-email-sequence.md"),
  "utf8",
);
const emails = parseAimoneycodeSequence(markdown);
assertCompleteSequence(emails);
assert.equal(emails.length, 30);
ok("exactly 30 emails exist");

assert.deepEqual(
  emails.map((e) => e.day),
  Array.from({ length: 30 }, (_, i) => i + 1),
);
ok("emails are ordered day 1 through 30");

for (let day = 1; day <= 10; day++) {
  assert.equal(ctaUrlForStep(day), WEBINAR_CTA_URL);
  assert.match(emails[day - 1].ctaLink, /aimoneycode\.com\.ng\/reg/);
}
ok("days 1 to 10 use the webinar CTA");

for (let day = 11; day <= 30; day++) {
  assert.equal(ctaUrlForStep(day), OFFER_CTA_URL);
  assert.match(emails[day - 1].ctaLink, /aimoneycode\.com\.ng\/offer/);
}
ok("days 11 to 30 use the offer CTA");

assert.match(
  emails[0].subject,
  /782 People Paid To Use What I Built In 3 Months/i,
);
ok("day 1 uses the strongest LeadThur subject");

assert.equal(campaignGreeting(null), "Hey,");
assert.equal(campaignGreeting(""), "Hey,");
assert.equal(campaignGreeting("undefined"), "Hey,");
assert.equal(campaignGreeting("Bamidele Matthew"), "Hey Bamidele,");
assert.equal(applyCampaignGreeting("Hey,\n\nHello there.", "Ada Lovelace"), "Hey Ada,\n\nHello there.");
assert.doesNotMatch(campaignGreeting("null"), /Hey null/);
ok("first-name fallback works and never emits null/undefined");

const rendered1 = renderCampaignEmailHtml({
  email: { ...emails[0], ctaLink: ctaUrlForStep(1) },
  stepNumber: 1,
  fullName: "Chinedu Okafor",
});
assert.match(rendered1.html, /https:\/\/aimoneycode\.com\.ng\/reg/);
assert.doesNotMatch(rendered1.html, /https:\/\/aimoneycode\.com\.ng\/offer/);
assert.match(rendered1.html, /Hey Chinedu,/);
ok("rendered email 1 keeps webinar destination");

const rendered11 = renderCampaignEmailHtml({
  email: { ...emails[10], ctaLink: ctaUrlForStep(11) },
  stepNumber: 11,
  fullName: null,
});
assert.match(rendered11.html, /https:\/\/aimoneycode\.com\.ng\/offer/);
assert.match(rendered11.html, /^[\s\S]*Hey,/);
ok("rendered email 11 keeps offer destination and Hey, fallback");

const csvEmails = extractEmailsFromCsv(
  "email,name\nada@example.com,Ada\ncert+bounce@digitalskillx.com,Cert\nbad\n",
);
assert.ok(csvEmails.includes("ada@example.com"));
const preview = filterEnrollmentCandidates({
  source: "csv",
  candidates: [
    { email: "ada@example.com", fullName: "Ada", profileId: "1" },
    { email: "cert+x@digitalskillx.com", fullName: "Cert", profileId: "2" },
    { email: "ada@example.com", fullName: "Ada", profileId: "1" },
    { email: "skip@example.com", fullName: "Skip", profileId: "3" },
    { email: "done@example.com", fullName: "Done", profileId: "4" },
  ],
  suppressedEmails: new Set(["skip@example.com"]),
  alreadyEnrolledEmails: new Set(["done@example.com"]),
});
assert.equal(preview.selected.length, 1);
assert.equal(preview.selected[0].email, "ada@example.com");
assert.equal(preview.skippedSynthetic, 1);
assert.equal(preview.skippedSuppressed, 1);
assert.equal(preview.skippedAlreadyEnrolled, 1);
assert.ok(preview.selected.length < 5);
ok("recipient selection is explicit and does not auto-target every user");
{
  const storeSrc = readFileSync(join(root, "lib/email-campaigns/store.ts"), "utf8");
  const panel = readFileSync(join(root, "components/admin/email-campaign-panel.tsx"), "utf8");
  assert.match(storeSrc, /from\("enrollments"\)/);
  assert.match(storeSrc, /listEverEnrolledStudentIds/);
  assert.match(storeSrc, /bulk_import_email_outbox/);
  assert.match(storeSrc, /listBulkUploadCandidates/);
  assert.doesNotMatch(storeSrc, /bulk_import_rows/);
  assert.match(panel, /Every enrolled student and every bulk-uploaded student/);
  assert.match(panel, /Start sending to all students/);
  ok("student enrollment source includes enrollments and bulk uploads");
}

assert.equal(canProcessCampaign("draft").ok, false);
assert.equal(canProcessCampaign("paused").ok, false);
assert.equal(canProcessCampaign("active").ok, true);
ok("draft and paused campaigns do not send");

{
  const actions = readFileSync(
    join(root, "app/(admin)/admin/(panel)/email-campaigns/actions.ts"),
    "utf8",
  );
  const panel = readFileSync(join(root, "components/admin/email-campaign-panel.tsx"), "utf8");
  assert.match(actions, /isValidEmail\(to\)/);
  assert.doesNotMatch(actions, /Customer addresses are blocked/);
  assert.doesNotMatch(panel, /Customer addresses are rejected/);
  ok("admin test send accepts any valid email and does not enroll");
}

function createMemoryStore(seed) {
  const campaign = { ...seed.campaign };
  const recipients = new Map(seed.recipients.map((r) => [r.id, { ...r }]));
  const sends = [...(seed.sends ?? [])];
  const suppressed = new Set((seed.suppressed ?? []).map(normalizeEmail));
  let sendSeq = 1;
  let clockIso = seed.nowIso;

  return {
    campaign,
    recipients,
    sends,
    suppressed,
    setNow(iso) {
      clockIso = iso;
    },
    async getCampaignBySlug(slug) {
      return campaign.slug === slug ? campaign : null;
    },
    async listDueRecipients(campaignId, nowIso, limit) {
      if (campaign.id !== campaignId) return [];
      return [...recipients.values()]
        .filter(
          (r) =>
            r.status === "active" &&
            r.next_send_at <= nowIso &&
            r.next_step <= AIMONEYCODE_TOTAL_STEPS,
        )
        .slice(0, limit);
    },
    async isEmailSuppressed(email) {
      return suppressed.has(normalizeEmail(email));
    },
    async getSend(recipientId, stepNumber) {
      return sends.find((s) => s.recipient_id === recipientId && s.step_number === stepNumber) ?? null;
    },
    async insertPendingSend(row) {
      const exists = sends.find(
        (s) => s.recipient_id === row.recipientId && s.step_number === row.stepNumber,
      );
      if (exists) return "exists";
      sends.push({
        id: `send-${sendSeq++}`,
        campaign_id: row.campaignId,
        recipient_id: row.recipientId,
        step_number: row.stepNumber,
        idempotency_key: row.idempotencyKey,
        status: "pending",
        attempts: 0,
        scheduled_at: row.scheduledAt,
        provider_message_id: null,
      });
      return "inserted";
    },
    async claimPendingSends(limit) {
      const claimed = [];
      for (const send of sends) {
        if (claimed.length >= limit) break;
        if (send.status !== "pending") continue;
        if (send.scheduled_at > clockIso) continue;
        send.status = "sending";
        send.attempts += 1;
        claimed.push({ ...send });
      }
      return claimed;
    },
    async markSendResult(row) {
      const send = sends.find((s) => s.id === row.sendId);
      if (!send) return;
      send.status = row.status;
      if (row.providerMessageId !== undefined) send.provider_message_id = row.providerMessageId;
      if (row.scheduledAt) send.scheduled_at = row.scheduledAt;
    },
    async markRecipientSent(row) {
      const recipient = recipients.get(row.recipientId);
      if (!recipient) return;
      recipient.last_sent_step = row.stepNumber;
      recipient.next_step = row.nextStep;
      recipient.next_send_at = row.nextSendAt ?? recipient.next_send_at;
      if (row.completed) recipient.status = "completed";
    },
    async markRecipientUnsubscribed(recipientId) {
      const recipient = recipients.get(recipientId);
      if (recipient) recipient.status = "unsubscribed";
    },
    async markRecipientFailed(recipientId) {
      const recipient = recipients.get(recipientId);
      if (recipient) recipient.status = "failed";
    },
    async getRecipient(id) {
      return recipients.get(id) ?? null;
    },
  };
}

const now = new Date("2026-08-18T10:00:00.000Z");
const nowIso = now.toISOString();
const later = new Date(now.getTime() + 25 * 60 * 60 * 1000);

function recipientFixture(overrides = {}) {
  return {
    id: "r1",
    campaign_id: "c1",
    email: "ada@example.com",
    profile_id: "p1",
    full_name: "Ada Lovelace",
    status: "active",
    next_step: 1,
    last_sent_step: 0,
    next_send_at: nowIso,
    ...overrides,
  };
}

const campaignFixture = {
  id: "c1",
  slug: "aimoneycode-30-day",
  name: "AI Money Code 30-Day Email Sequence",
  status: "active",
  total_steps: 30,
};

{
  const store = createMemoryStore({
    nowIso,
    campaign: { ...campaignFixture, status: "draft" },
    recipients: [recipientFixture()],
  });
  const sent = [];
  const result = await processAimoneycodeCampaignTick({
    store,
    now,
    sendEmail: async (mail) => {
      sent.push(mail);
      return { messageId: "m1" };
    },
  });
  assert.equal(result.reason, "draft");
  assert.equal(sent.length, 0);
  ok("draft campaign does not send");
}

{
  const store = createMemoryStore({
    nowIso,
    campaign: { ...campaignFixture, status: "paused" },
    recipients: [recipientFixture()],
  });
  const sent = [];
  const result = await processAimoneycodeCampaignTick({
    store,
    now,
    sendEmail: async (mail) => {
      sent.push(mail);
      return { messageId: "m1" };
    },
  });
  assert.equal(result.reason, "paused");
  assert.equal(sent.length, 0);
  ok("paused campaign does not send");
}

{
  const store = createMemoryStore({
    nowIso,
    campaign: campaignFixture,
    recipients: [recipientFixture()],
  });
  const sent = [];
  const first = await processAimoneycodeCampaignTick({
    store,
    now,
    sendEmail: async (mail) => {
      sent.push(mail);
      return { messageId: "m1" };
    },
  });
  assert.equal(first.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(store.recipients.get("r1").next_step, 2);
  assert.equal(store.sends.filter((s) => s.step_number === 1 && s.status === "sent").length, 1);

  const second = await processAimoneycodeCampaignTick({
    store,
    now,
    sendEmail: async (mail) => {
      sent.push(mail);
      return { messageId: "m2" };
    },
  });
  assert.equal(second.sent, 0);
  assert.equal(sent.length, 1);
  assert.equal(store.sends.filter((s) => s.step_number === 1).length, 1);
  ok("email 1 sends once after enrollment and cannot send the same step twice");
}

{
  const store = createMemoryStore({
    nowIso: later.toISOString(),
    campaign: campaignFixture,
    recipients: [
      recipientFixture({
        next_step: 2,
        last_sent_step: 1,
        next_send_at: later.toISOString(),
      }),
    ],
    sends: [
      {
        id: "send-1",
        campaign_id: "c1",
        recipient_id: "r1",
        step_number: 1,
        idempotency_key: campaignIdempotencyKey("c1", "r1", 1),
        status: "sent",
        attempts: 1,
        scheduled_at: nowIso,
        provider_message_id: "m1",
      },
    ],
  });
  store.setNow(later.toISOString());
  const result = await processAimoneycodeCampaignTick({
    store,
    now: later,
    sendEmail: async () => ({ messageId: "m2" }),
  });
  assert.equal(result.sent, 1);
  assert.equal(store.recipients.get("r1").next_step, 3);
  ok("resume works: next email sends after the 24-hour window");
}

{
  const store = createMemoryStore({
    nowIso,
    campaign: campaignFixture,
    recipients: [recipientFixture()],
    suppressed: ["ada@example.com"],
  });
  const result = await processAimoneycodeCampaignTick({
    store,
    now,
    sendEmail: async () => ({ messageId: "should-not-send" }),
  });
  assert.equal(result.sent, 0);
  assert.equal(result.unsubscribed, 1);
  assert.equal(store.recipients.get("r1").status, "unsubscribed");
  ok("unsubscribed/suppressed recipients stop receiving emails");
}

{
  const store = createMemoryStore({
    nowIso,
    campaign: campaignFixture,
    recipients: [
      recipientFixture({
        next_step: 30,
        last_sent_step: 29,
      }),
    ],
  });
  const result = await processAimoneycodeCampaignTick({
    store,
    now,
    sendEmail: async () => ({ messageId: "m30" }),
  });
  assert.equal(result.sent, 1);
  assert.equal(result.completed, 1);
  assert.equal(store.recipients.get("r1").status, "completed");
  assert.equal(store.recipients.get("r1").next_step, 31);
  const after = await processAimoneycodeCampaignTick({
    store,
    now: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    sendEmail: async () => ({ messageId: "m31" }),
  });
  assert.equal(after.sent, 0);
  ok("completed recipients stop after email 30");
}

{
  const store = createMemoryStore({
    nowIso,
    campaign: campaignFixture,
    recipients: [recipientFixture()],
  });
  const first = await processAimoneycodeCampaignTick({
    store,
    now,
    sendEmail: async () => ({ error: new Error("provider timeout") }),
  });
  assert.equal(first.failed, 1);
  assert.equal(store.sends[0].status, "pending");
  assert.ok(store.sends[0].scheduled_at > nowIso);
  ok("failed sends stay retryable with backoff instead of duplicating a sent row");
}

{
  const next = nextSendAtAfter(now, 1);
  assert.ok(next);
  assert.equal(next.getTime() - now.getTime(), 24 * 60 * 60 * 1000);
  assert.equal(nextSendAtAfter(now, 30), null);
  ok("email 2 is eligible 24 hours after email 1; email 30 has no follow-up");
}

{
  const dryRun = filterEnrollmentCandidates({
    source: "students",
    candidates: [{ email: "ada@example.com", fullName: "Ada", profileId: "1" }],
    suppressedEmails: new Set(),
    alreadyEnrolledEmails: new Set(),
  });
  assert.equal(dryRun.selected.length, 1);
  ok("dry-run preview only returns candidates and does not send mail");
}

{
  const client = readFileSync(join(root, "components/admin/email-campaign-panel.tsx"), "utf8");
  const actions = readFileSync(
    join(root, "app/(admin)/admin/(panel)/email-campaigns/actions.ts"),
    "utf8",
  );
  assert.doesNotMatch(client, /RESEND_API_KEY|CRON_SECRET|re_[A-Za-z0-9]{8,}/);
  assert.doesNotMatch(actions, /NEXT_PUBLIC_RESEND/);
  assert.match(actions, /revalidatePath\("\/admin\/email-campaigns"\)/);
  ok("no email secrets appear in client campaign UI");
}

{
  const page = readFileSync(
    join(root, "app/(admin)/admin/(panel)/email-campaigns/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(page, /enrollCandidates|processAimoneycodeCampaignTick/);
  assert.match(page, /maxDuration = 120/);
  ok("admin page load does not enroll or send");
}

{
  const actions = readFileSync(
    join(root, "app/(admin)/admin/(panel)/email-campaigns/actions.ts"),
    "utf8",
  );
  assert.match(actions, /startSendingToAllStudents/);
  assert.match(actions, /scheduleBulkWorkerContinuation/);
  assert.doesNotMatch(actions, /processAimoneycodeCampaignTick/);
  ok("start sending enrolls then kicks the server worker instead of sending inline");
}

{
  const sequenceSrc = readFileSync(join(root, "lib/email-campaigns/sequence.ts"), "utf8");
  const nextConfig = readFileSync(join(root, "next.config.mjs"), "utf8");
  assert.match(sequenceSrc, /aimoneycode-30-day-email-sequence\.md/);
  assert.match(nextConfig, /asset\/source/);
  assert.equal(loadAimoneycodeSequence().length, 30);
  ok("sequence copy is bundled for production and still loads 30 emails");
}

{
  const outbox = readFileSync(join(root, "lib/bulk-import-email-outbox.ts"), "utf8");
  const system = readFileSync(join(root, "lib/email/index.ts"), "utf8");
  assert.match(outbox, /drainBulkImportEmailOutboxUntilBudget/);
  assert.match(system, /sendViaResend/);
  ok("existing transactional and bulk-import email paths remain in place");
}

assert.equal(AIMONEYCODE_TOTAL_STEPS, 30);
ok("campaign step count stays 30");

console.log(`\nAI Money Code campaign: ${passed} passed`);
