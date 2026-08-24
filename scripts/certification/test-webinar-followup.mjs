#!/usr/bin/env node
/**
 * Offline Webinar Follow-Up campaign engine tests — no live sends, no DB writes.
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
  canProcessCampaign,
  normalizeEmail,
  isValidEmail,
  webinarIdempotencyKey,
  nextSendAtAfter,
  isAuthorizedTestRecipient,
  maskEmail,
  webinarPersonalFirstName,
  WEBINAR_FOLLOWUP_OFFER_URL,
  WEBINAR_FOLLOWUP_DEFAULT_SLUG,
  lagosDayStartUtc,
} = await import(ts("lib/webinar-followup/constants.ts"));

const {
  extractContactsFromCsv,
  buildDryRunReport,
  guessCsvColumns,
  parseCsvMatrix,
} = await import(ts("lib/webinar-followup/csv.ts"));

const { processWebinarFollowupTick, drainWebinarFollowupUntilBudget } = await import(
  ts("lib/webinar-followup/processor.ts")
);
const { renderWebinarFollowupEmail } = await import(ts("lib/webinar-followup/render.ts"));
const {
  buildSoftwareWithAiSequence,
  BUILD_SOFTWARE_SEQUENCE_LENGTH,
} = await import(ts("lib/webinar-followup/sequence-seed.ts"));

// ── Constants / gates
assert.equal(canProcessCampaign("draft").ok, false);
assert.equal(canProcessCampaign("paused").ok, false);
assert.equal(canProcessCampaign("archived").ok, false);
assert.equal(canProcessCampaign("active").ok, true);
ok("draft/paused/archived never process; active does");

assert.equal(normalizeEmail("  Ada@Example.COM "), "ada@example.com");
assert.equal(isValidEmail("not-an-email"), false);
assert.equal(isValidEmail("ok@example.com"), true);
assert.match(maskEmail("ada.lovelace@example.com"), /ad\*\*\*@example\.com/);
ok("email normalize / validate / mask");

assert.equal(
  webinarIdempotencyKey("c1", "r1", 3),
  "wfu:c1:r1:3",
);
assert.notEqual(
  webinarIdempotencyKey("c1", "r1", 3),
  webinarIdempotencyKey("c1", "r1", 4),
);
ok("idempotency keys are unique per contact+step");

{
  const a = nextSendAtAfter(new Date("2026-08-21T10:00:00Z"), 24);
  assert.equal(a.toISOString(), "2026-08-22T10:00:00.000Z");
  ok("per-step delay drives next_send_at");
}

{
  const start = lagosDayStartUtc(new Date("2026-08-23T00:30:00Z"));
  assert.equal(start.toISOString(), "2026-08-22T23:00:00.000Z");
  ok("today's send window starts at Lagos midnight");
}

assert.equal(isAuthorizedTestRecipient("admin@digitalskillx.com", "admin@digitalskillx.com"), true);
assert.equal(isAuthorizedTestRecipient("other@customer.com", "admin@digitalskillx.com"), false);
assert.equal(isAuthorizedTestRecipient("ops@digitalskillx.com", "admin@digitalskillx.com"), true);
assert.equal(isAuthorizedTestRecipient("someone@gmail.com", "admin@digitalskillx.com"), true);
assert.equal(isAuthorizedTestRecipient("Someone.Name+tag@Gmail.COM", "admin@digitalskillx.com"), true);
ok("test send allows Gmail and rejects arbitrary customer addresses");

// ── CSV dry-run logic
{
  const csv = `Email,First Name
ada@example.com,Ada
ADA@example.com,Ada Dup
bad-email,Nope
skip@example.com,Skip
done@example.com,Done
new@example.com,New
`;
  const extracted = extractContactsFromCsv({ raw: csv });
  assert.equal(extracted.duplicatesInFile, 1);
  assert.ok(extracted.contacts.some((c) => c.normalizedEmail === "ada@example.com"));
  assert.ok(extracted.invalidRows.length >= 1);

  const report = buildDryRunReport({
    totalRows: parseCsvMatrix(csv).rows.length,
    contacts: extracted.contacts,
    invalidCount: extracted.invalidRows.length,
    duplicatesInFile: extracted.duplicatesInFile,
    alreadyInCampaign: new Set(["done@example.com"]),
    suppressed: new Set(["skip@example.com"]),
  });
  assert.equal(report.alreadyInCampaign, 1);
  assert.equal(report.suppressed, 1);
  assert.ok(report.eligibleNew >= 2);
  assert.equal(report.willEnroll, report.eligibleNew);
  ok("CSV dry-run classifies new / existing / suppressed / invalid / in-file dupes");
}

{
  const guess = guessCsvColumns(["Attendee Email", "Full Name", "Phone"]);
  assert.equal(guess.emailColumn, "Attendee Email");
  ok("CSV email column auto-detection");
}

// ── Sequence seed
{
  const emails = buildSoftwareWithAiSequence();
  assert.equal(emails.length, BUILD_SOFTWARE_SEQUENCE_LENGTH);
  assert.equal(emails.length, 40);
  assert.deepEqual(
    emails.map((e) => e.stepNumber),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  assert.ok(emails.every((e) => e.altSubjects.length === 2 && e.angle && e.category));
  assert.equal(emails[0].delayHours, 0);
  assert.ok(emails.slice(1).every((e) => e.delayHours === 24));
  assert.ok(emails.slice(0, 10).every((e) => e.ctaUrl.includes("/reg")));
  assert.ok(emails.slice(10).every((e) => e.ctaUrl.includes("/offer")));
  assert.match(emails[0].bodyText, /webinar|WebinarJam|registered/i);
  assert.ok(emails.slice(0, 10).every((e) => !e.bodyText.includes("₦49,999")));
  assert.ok(emails.every((e) => e.bodyText.trim().length >= 500));
  assert.match(
    emails.map((e) => e.bodyText).join("\n"),
    /What PromptEarn is \*\*not\*\* proof of/i,
  );
  assert.doesNotMatch(
    emails.map((e) => e.bodyText).join("\n"),
    /PromptEarn was built using this AI[- ]building method/i,
  );
  ok("40-email seed is ordered, delayed correctly, CTA split webinar/offer, PromptEarn not claimed as method proof");
}

{
  const rendered = renderWebinarFollowupEmail({
    email: buildSoftwareWithAiSequence()[0],
    firstName: "Ada",
    campaignSlug: WEBINAR_FOLLOWUP_DEFAULT_SLUG,
    unsubscribeUrl: "https://example.com/unsubscribe?token=x",
  });
  assert.match(rendered.html, /Ada,/);
  assert.match(rendered.html, /Unsubscribe/i);
  assert.match(rendered.html, /aimoneycode\.com\.ng\/reg/);
  assert.match(rendered.html, /DigitalSkillX/);
  assert.doesNotMatch(rendered.html, /₦49,999/);
  assert.match(rendered.text, /WebinarJam has already done its own follow-up/);
  assert.doesNotMatch(rendered.html, /PDIGITAL MARKETSTORE LTD/);
  ok("render includes greeting, unsubscribe, and webinar CTA for email 1");

  const noFakeName = renderWebinarFollowupEmail({
    email: buildSoftwareWithAiSequence()[0],
    firstName: "Platform",
    campaignSlug: WEBINAR_FOLLOWUP_DEFAULT_SLUG,
    unsubscribeUrl: "https://example.com/unsubscribe?token=x",
  });
  assert.doesNotMatch(noFakeName.html, />Platform,</);
  assert.match(noFakeName.text, /^If you are still on this list/);
  assert.equal(webinarPersonalFirstName("Platform"), null);
  assert.equal(webinarPersonalFirstName("Ada Okafor"), "Ada");
  ok("org/role labels are not used as greetings; copy starts as written");

  const renderedOffer = renderWebinarFollowupEmail({
    email: buildSoftwareWithAiSequence()[10],
    firstName: null,
    campaignSlug: WEBINAR_FOLLOWUP_DEFAULT_SLUG,
  });
  assert.match(renderedOffer.html, /aimoneycode\.com\.ng\/offer/);
  ok("email 11 uses offer CTA");
}

// ── In-memory processor: per-contact independent sequences + no duplicate steps
function createMemoryStore(seed) {
  const campaigns = new Map(seed.campaigns.map((c) => [c.id, { ...c }]));
  const contacts = new Map(seed.contacts.map((c) => [c.id, { ...c }]));
  const steps = new Map(seed.steps.map((s) => [`${s.campaign_id}:${s.stepNumber}`, { ...s }]));
  const sends = new Map();
  const suppressed = new Set(seed.suppressed ?? []);

  return {
    async listActiveCampaigns() {
      return [...campaigns.values()].filter((c) => c.status === "active");
    },
    async getCampaign(id) {
      return campaigns.get(id) ?? null;
    },
    async listDueContacts(campaignId, nowIso, limit) {
      return [...contacts.values()]
        .filter(
          (c) =>
            c.campaign_id === campaignId &&
            c.status === "active" &&
            c.next_send_at <= nowIso,
        )
        .sort((a, b) => a.next_send_at.localeCompare(b.next_send_at))
        .slice(0, limit);
    },
    async getStep(campaignId, stepNumber) {
      return steps.get(`${campaignId}:${stepNumber}`) ?? null;
    },
    async isEmailSuppressed(email) {
      return suppressed.has(normalizeEmail(email));
    },
    async getSend(contactId, stepNumber) {
      return sends.get(`${contactId}:${stepNumber}`) ?? null;
    },
    async insertPendingSend(row) {
      const key = `${row.contactId}:${row.stepNumber}`;
      if (sends.has(key)) return "exists";
      sends.set(key, {
        id: `send-${sends.size + 1}`,
        campaign_id: row.campaignId,
        contact_id: row.contactId,
        step_id: row.stepId,
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
      for (const send of sends.values()) {
        if (send.status !== "pending") continue;
        send.status = "sending";
        send.attempts += 1;
        claimed.push({ ...send });
        if (claimed.length >= limit) break;
      }
      return claimed;
    },
    async markSendResult(params) {
      for (const send of sends.values()) {
        if (send.id !== params.sendId) continue;
        send.status = params.status;
        if (params.providerMessageId) send.provider_message_id = params.providerMessageId;
        if (params.scheduledAt) send.scheduled_at = params.scheduledAt;
        if (params.lastError) send.last_error = params.lastError;
      }
    },
    async markContactSent(params) {
      const c = contacts.get(params.contactId);
      if (!c) return;
      c.last_sent_step = params.stepNumber;
      c.last_sent_at = params.sentAt;
      c.current_step = params.nextStep;
      c.next_send_at = params.nextSendAt ?? params.sentAt;
      if (params.completed) {
        c.status = "completed";
        c.completed_at = params.sentAt;
      }
    },
    async markContactUnsubscribed(contactId, at) {
      const c = contacts.get(contactId);
      if (!c) return;
      c.status = "unsubscribed";
      c.unsubscribed_at = at;
    },
    async markContactFailed(contactId, at, error) {
      const c = contacts.get(contactId);
      if (!c) return;
      c.status = "failed";
      c.failed_at = at;
      c.last_error = error;
    },
    async getContact(id) {
      return contacts.get(id) ?? null;
    },
    _contacts: contacts,
    _sends: sends,
  };
}

function makeSteps(campaignId, n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `step-${i + 1}`,
    campaign_id: campaignId,
    stepNumber: i + 1,
    internalTitle: `Step ${i + 1}`,
    subject: `Subject ${i + 1}`,
    altSubjects: [`Alt A ${i + 1}`, `Alt B ${i + 1}`],
    previewText: "",
    bodyText: `Body for step ${i + 1}`,
    ctaLabel: "See The Full Offer",
    ctaUrl: WEBINAR_FOLLOWUP_OFFER_URL,
    delayHours: i === 0 ? 0 : 24,
    angle: "test",
    category: "test",
    status: "active",
  }));
}

{
  const campaignId = "camp-1";
  const now = new Date("2026-08-21T12:00:00Z");
  const store = createMemoryStore({
    campaigns: [
      {
        id: campaignId,
        slug: "build-software-with-ai",
        name: "Test",
        status: "active",
        total_steps: 3,
      },
    ],
    steps: makeSteps(campaignId, 3),
    contacts: [
      {
        id: "older",
        campaign_id: campaignId,
        email: "older@example.com",
        normalized_email: "older@example.com",
        first_name: "Older",
        status: "active",
        current_step: 2,
        last_sent_step: 1,
        next_send_at: "2026-08-21T11:00:00Z",
      },
      {
        id: "newer",
        campaign_id: campaignId,
        email: "newer@example.com",
        normalized_email: "newer@example.com",
        first_name: "Newer",
        status: "active",
        current_step: 1,
        last_sent_step: 0,
        next_send_at: "2026-08-21T11:30:00Z",
      },
    ],
    suppressed: [],
  });

  const sentSubjects = [];
  const result = await processWebinarFollowupTick({
    store,
    now,
    limit: 10,
    sendEmail: async ({ to, subject }) => {
      sentSubjects.push({ to, subject });
      return { messageId: `msg-${sentSubjects.length}` };
    },
  });

  assert.equal(result.sent, 2);
  assert.equal(store._contacts.get("older").current_step, 3);
  assert.equal(store._contacts.get("newer").current_step, 2);
  assert.equal(store._sends.get("older:2").status, "sent");
  assert.equal(store._sends.get("newer:1").status, "sent");
  assert.equal(store._sends.has("older:1"), false);
  ok("older contact continues at step 2; newer starts at step 1 independently");
}

{
  const campaignId = "camp-dup";
  const now = new Date("2026-08-21T12:00:00Z");
  const store = createMemoryStore({
    campaigns: [
      { id: campaignId, slug: "x", name: "X", status: "active", total_steps: 2 },
    ],
    steps: makeSteps(campaignId, 2),
    contacts: [
      {
        id: "c1",
        campaign_id: campaignId,
        email: "once@example.com",
        normalized_email: "once@example.com",
        first_name: null,
        status: "active",
        current_step: 1,
        last_sent_step: 0,
        next_send_at: "2026-08-21T10:00:00Z",
      },
    ],
  });
  let sends = 0;
  const mailer = async () => {
    sends += 1;
    return { messageId: `m-${sends}` };
  };
  await processWebinarFollowupTick({ store, now, sendEmail: mailer, limit: 5 });
  await processWebinarFollowupTick({ store, now, sendEmail: mailer, limit: 5 });
  assert.equal(sends, 1);
  assert.equal(store._sends.size, 1);
  ok("processor running twice does not duplicate the same step send");
}

{
  const campaignId = "camp-draft";
  const store = createMemoryStore({
    campaigns: [
      { id: campaignId, slug: "x", name: "X", status: "draft", total_steps: 1 },
    ],
    steps: makeSteps(campaignId, 1),
    contacts: [
      {
        id: "c1",
        campaign_id: campaignId,
        email: "a@example.com",
        normalized_email: "a@example.com",
        first_name: null,
        status: "active",
        current_step: 1,
        last_sent_step: 0,
        next_send_at: "2026-08-21T10:00:00Z",
      },
    ],
  });
  let sends = 0;
  const result = await processWebinarFollowupTick({
    store,
    campaignId,
    sendEmail: async () => {
      sends += 1;
      return { messageId: "x" };
    },
  });
  assert.equal(sends, 0);
  assert.equal(result.reason, "draft");
  ok("draft campaign sends nothing");
}

{
  const campaignId = "camp-pause";
  const store = createMemoryStore({
    campaigns: [
      { id: campaignId, slug: "x", name: "X", status: "paused", total_steps: 1 },
    ],
    steps: makeSteps(campaignId, 1),
    contacts: [
      {
        id: "c1",
        campaign_id: campaignId,
        email: "a@example.com",
        normalized_email: "a@example.com",
        first_name: null,
        status: "active",
        current_step: 1,
        last_sent_step: 0,
        next_send_at: "2026-08-21T10:00:00Z",
      },
    ],
  });
  const result = await processWebinarFollowupTick({
    store,
    campaignId,
    sendEmail: async () => ({ messageId: "x" }),
  });
  assert.equal(result.sent, 0);
  assert.equal(result.reason, "paused");
  ok("paused campaign stops sends while contacts retain progress");
}

{
  const campaignId = "camp-unsub";
  const store = createMemoryStore({
    campaigns: [
      { id: campaignId, slug: "x", name: "X", status: "active", total_steps: 2 },
    ],
    steps: makeSteps(campaignId, 2),
    contacts: [
      {
        id: "c1",
        campaign_id: campaignId,
        email: "gone@example.com",
        normalized_email: "gone@example.com",
        first_name: null,
        status: "active",
        current_step: 1,
        last_sent_step: 0,
        next_send_at: "2026-08-21T10:00:00Z",
      },
    ],
    suppressed: ["gone@example.com"],
  });
  const result = await processWebinarFollowupTick({
    store,
    now: new Date("2026-08-21T12:00:00Z"),
    sendEmail: async () => ({ messageId: "should-not" }),
  });
  assert.equal(result.unsubscribed, 1);
  assert.equal(store._contacts.get("c1").status, "unsubscribed");
  ok("suppressed contact is unsubscribed and not sent");
}

{
  const campaignId = "camp-complete";
  const now = new Date("2026-08-21T12:00:00Z");
  const store = createMemoryStore({
    campaigns: [
      { id: campaignId, slug: "x", name: "X", status: "active", total_steps: 1 },
    ],
    steps: makeSteps(campaignId, 1),
    contacts: [
      {
        id: "c1",
        campaign_id: campaignId,
        email: "last@example.com",
        normalized_email: "last@example.com",
        first_name: null,
        status: "active",
        current_step: 1,
        last_sent_step: 0,
        next_send_at: "2026-08-21T10:00:00Z",
      },
    ],
  });
  await processWebinarFollowupTick({
    store,
    now,
    sendEmail: async () => ({ messageId: "final" }),
  });
  assert.equal(store._contacts.get("c1").status, "completed");
  ok("final step marks contact completed");
}

{
  const campaignId = "camp-retry";
  const now = new Date("2026-08-21T12:00:00Z");
  const store = createMemoryStore({
    campaigns: [
      { id: campaignId, slug: "x", name: "X", status: "active", total_steps: 1 },
    ],
    steps: makeSteps(campaignId, 1),
    contacts: [
      {
        id: "c1",
        campaign_id: campaignId,
        email: "retry@example.com",
        normalized_email: "retry@example.com",
        first_name: null,
        status: "active",
        current_step: 1,
        last_sent_step: 0,
        next_send_at: "2026-08-21T10:00:00Z",
      },
    ],
  });
  let calls = 0;
  await processWebinarFollowupTick({
    store,
    now,
    sendEmail: async () => {
      calls += 1;
      return { error: new Error("temporary") };
    },
  });
  const send = store._sends.get("c1:1");
  assert.equal(send.status, "pending");
  assert.ok(send.scheduled_at > now.toISOString());
  assert.equal(store._contacts.get("c1").current_step, 1);
  ok("failed send retries without advancing contact");
}

{
  const migration = readFileSync(
    join(root, "supabase/migrations/0048_webinar_followup_campaigns.sql"),
    "utf8",
  );
  assert.match(migration, /webinar_followup_campaigns/);
  assert.match(migration, /webinar_followup_contacts/);
  assert.match(migration, /webinar_followup_sends/);
  assert.match(migration, /campaign_id, normalized_email/);
  assert.match(migration, /contact_id, step_number/);
  assert.match(migration, /claim_webinar_followup_sends/);
  assert.match(migration, /status.*draft/);
  assert.doesNotMatch(migration, /email_campaign_recipients/);
  ok("migration isolates webinar tables with unique constraints and claim RPC");
}

{
  const panel = readFileSync(
    join(root, "components/admin/webinar-followup-campaign-panel.tsx"),
    "utf8",
  );
  const actions = readFileSync(
    join(root, "app/(admin)/admin/(panel)/webinar-follow-up/actions.ts"),
    "utf8",
  );
  const importRoute = readFileSync(
    join(root, "app/api/admin/webinar-follow-up/[campaignId]/import/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(actions, /WEBINAR_FOLLOWUP_ALLOW_ACTIVATE/);
  assert.match(actions, /Activate this campaign|Campaign activated/);
  assert.match(actions, /isAuthorizedTestRecipient/);
  assert.match(panel, /Import New Contacts/);
  assert.doesNotMatch(panel, /Confirm enrollment/);
  assert.doesNotMatch(panel, /Dry-run/);
  assert.match(panel, /Activate Campaign/);
  assert.match(panel, /\[TEST\]/);
  assert.match(importRoute, /importNewContactsOneShot/);
  assert.match(importRoute, /keepWebinarFollowupSending/);
  const drainRoute = readFileSync(
    join(root, "app/api/admin/webinar-follow-up/[campaignId]/drain/route.ts"),
    "utf8",
  );
  assert.match(drainRoute, /runLiveWebinarFollowupDrain/);
  assert.match(panel, /Send due emails now/);
  assert.match(panel, /Today's emails have been sent|Today&apos;s emails have been sent/);
  ok("admin flow is one-click import + confirm-modal activate; no env activation lock");
}

{
  const unsub = readFileSync(join(root, "app/unsubscribe/actions.ts"), "utf8");
  assert.match(unsub, /suppressWebinarContact/);
  assert.match(unsub, /AIMONEYCODE_CAMPAIGN_SLUG/);
  ok("unsubscribe supports both AIMC and webinar follow-up without conflating stores");
}

{
  const continueSrc = readFileSync(join(root, "lib/bulk-import-continue.ts"), "utf8");
  const vercel = readFileSync(join(root, "vercel.json"), "utf8");
  assert.match(continueSrc, /keepWebinarFollowupSending/);
  assert.match(continueSrc, /delayMs/);
  assert.match(vercel, /\/api\/cron\/webinar-follow-up/);
  assert.match(vercel, /25 10 \* \* \*/);
  ok("cron path and continuation support webinar follow-up");
}

{
  // Isolation guards: must not wire into AIMC enrollment / LMS profiles
  const storeSrc = readFileSync(join(root, "lib/webinar-followup/store.ts"), "utf8");
  assert.doesNotMatch(storeSrc, /from\("enrollments"\)/);
  assert.doesNotMatch(storeSrc, /from\("email_campaign_recipients"\)/);
  assert.doesNotMatch(storeSrc, /aimoneycode-30-day/);
  ok("webinar store stays isolated from LMS enrollments and AIMC recipients");
}

{
  const { validateWebinarSequence } = await import(ts("lib/webinar-followup/validate-sequence.ts"));
  const { WEBINAR_FOLLOWUP_REQUIRED_STEPS } = await import(ts("lib/webinar-followup/constants.ts"));
  assert.equal(WEBINAR_FOLLOWUP_REQUIRED_STEPS, 40);
  const full = buildSoftwareWithAiSequence();
  assert.equal(validateWebinarSequence(full).ok, true);
  assert.equal(validateWebinarSequence(full.slice(0, 39)).ok, false);
  const dup = [...full];
  dup[5] = { ...dup[5], stepNumber: 1 };
  assert.equal(validateWebinarSequence(dup).ok, false);
  ok("validator requires exactly 40 ordered unique steps");
}

{
  const { encodeStepBodyHtml, parseStepMeta, stripStepMeta } = await import(
    ts("lib/webinar-followup/step-meta.ts")
  );
  const sample = buildSoftwareWithAiSequence()[0];
  const html = encodeStepBodyHtml(sample);
  const meta = parseStepMeta(html);
  assert.equal(meta.altSubjects[0], sample.altSubjects[0]);
  assert.equal(meta.angle, sample.angle);
  assert.equal(stripStepMeta(html), sample.bodyText);
  assert.doesNotMatch(sample.bodyText, /wfu-meta/);
  ok("step meta encodes into body_html without polluting sendable body_text");
}

{
  const campaignId = "camp-40";
  const now = new Date("2026-08-21T12:00:00Z");
  const store = createMemoryStore({
    campaigns: [
      { id: campaignId, slug: "x", name: "X", status: "active", total_steps: 40 },
    ],
    steps: makeSteps(campaignId, 40),
    contacts: [
      {
        id: "c1",
        campaign_id: campaignId,
        email: "last@example.com",
        normalized_email: "last@example.com",
        first_name: null,
        status: "active",
        current_step: 40,
        last_sent_step: 39,
        next_send_at: "2026-08-21T10:00:00Z",
      },
    ],
  });
  await processWebinarFollowupTick({
    store,
    now,
    sendEmail: async () => ({ messageId: "final-40" }),
  });
  assert.equal(store._contacts.get("c1").status, "completed");
  assert.equal(store._sends.get("c1:40").status, "sent");
  ok("completion after Step 40");
}

{
  const campaignId = "camp-arch";
  const store = createMemoryStore({
    campaigns: [
      { id: campaignId, slug: "x", name: "X", status: "archived", total_steps: 1 },
    ],
    steps: makeSteps(campaignId, 1),
    contacts: [
      {
        id: "c1",
        campaign_id: campaignId,
        email: "a@example.com",
        normalized_email: "a@example.com",
        first_name: null,
        status: "active",
        current_step: 1,
        last_sent_step: 0,
        next_send_at: "2026-08-21T10:00:00Z",
      },
    ],
  });
  const result = await processWebinarFollowupTick({
    store,
    campaignId,
    sendEmail: async () => ({ messageId: "x" }),
  });
  assert.equal(result.sent, 0);
  assert.equal(result.reason, "archived");
  ok("archived campaign sends nothing");
}

{
  const actions = readFileSync(
    join(root, "app/(admin)/admin/(panel)/webinar-follow-up/actions.ts"),
    "utf8",
  );
  const panel = readFileSync(
    join(root, "components/admin/webinar-followup-campaign-panel.tsx"),
    "utf8",
  );
  assert.match(actions, /WEBINAR_FOLLOWUP_REQUIRED_STEPS/);
  assert.match(actions, /Load the full \$\{WEBINAR_FOLLOWUP_REQUIRED_STEPS\}-email sequence/);
  assert.match(panel, /Import New Contacts/);
  assert.match(panel, /Load 40-email sequence|Re-sync sequence/);
  assert.doesNotMatch(panel, /Load 32-email sequence/);
  assert.match(panel, /Activate Campaign/);
  ok("activation requires full 40-step sequence; admin UI is one-click import");
}

{
  const subjects = new Set(buildSoftwareWithAiSequence().map((e) => e.subject));
  assert.equal(subjects.size, 40);
  const emails = buildSoftwareWithAiSequence();
  const cta1to10 = new Set(emails.slice(0, 10).map((e) => e.ctaLabel));
  assert.equal(cta1to10.size, 10);
  for (const email of emails) {
    const rendered = renderWebinarFollowupEmail({
      email,
      campaignSlug: WEBINAR_FOLLOWUP_DEFAULT_SLUG,
      unsubscribeUrl: "https://example.com/unsubscribe?token=x",
    });
    assert.match(rendered.html, /Unsubscribe/i);
    assert.match(rendered.text, /Unsubscribe/i);
  }
  assert.match(emails.map((e) => e.bodyText).join("\n"), /782 people paid to use it/);
  ok("all 40 primary subjects are unique");
}

{
  const { sequenceNeedsResync, WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION } = await import(
    ts("lib/webinar-followup/constants.ts")
  );
  assert.equal(sequenceNeedsResync("build-software-with-ai.v40.4", 40), true);
  assert.equal(sequenceNeedsResync("", 40), true);
  assert.equal(sequenceNeedsResync(WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION, 39), true);
  assert.equal(sequenceNeedsResync(WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION, 40), false);
  const liveDrain = readFileSync(join(root, "lib/webinar-followup/live-drain.ts"), "utf8");
  assert.match(liveDrain, /ensureSequenceFromSource/);
  ok("stale sequence copy is detected and live drain reseeds from source");
}

console.log(`\n${passed} webinar follow-up checks passed`);
