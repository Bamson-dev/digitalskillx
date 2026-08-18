"use client";

import { useFormState } from "react-dom";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  enrollCampaignRecipients,
  previewCampaignRecipients,
  setAimoneycodeCampaignStatus,
  testSendAimoneycodeEmail,
  type CampaignActionState,
} from "@/app/(admin)/admin/(panel)/email-campaigns/actions";

type EmailPreview = {
  day: number;
  subject: string;
  previewText: string;
  ctaLink: string;
  body: string;
};

type Counts = {
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

const emptyAction: CampaignActionState = {};

function ActionBanner({ state }: { state: CampaignActionState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      className={
        state.error
          ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
      }
    >
      {state.error ?? state.message}
      {state.preview ? (
        <span className="mt-1 block text-xs">
          Selected {state.preview.selected}. Already enrolled {state.preview.skippedAlreadyEnrolled}.
          Suppressed {state.preview.skippedSuppressed}. Synthetic {state.preview.skippedSynthetic}.
          Invalid {state.preview.skippedInvalid}. CSV unmatched {state.preview.unmatchedCsv}.
        </span>
      ) : null}
    </p>
  );
}

export function EmailCampaignPanel({
  campaignName,
  status,
  migrationRequired,
  counts,
  emails,
  adminEmail,
  resendReady,
}: {
  campaignName: string;
  status: string;
  migrationRequired: boolean;
  counts: Counts;
  emails: EmailPreview[];
  adminEmail: string;
  resendReady: boolean;
}) {
  const [previewState, previewAction] = useFormState(previewCampaignRecipients, emptyAction);
  const [enrollState, enrollAction] = useFormState(enrollCampaignRecipients, emptyAction);
  const [statusState, statusAction] = useFormState(setAimoneycodeCampaignStatus, emptyAction);
  const [testState, testAction] = useFormState(testSendAimoneycodeEmail, emptyAction);

  if (migrationRequired) {
    return (
      <Card>
        <CardHeader
          title="Migration required"
          description="Apply supabase/migrations/0046_email_campaigns.sql in the Supabase SQL editor. Do not enroll anyone until that is done. The campaign stays draft until you activate it."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={campaignName}
          description="Draft by default. Recipients are not emailed until you enroll a list and then activate the campaign."
        />
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="font-semibold capitalize">{status}</dd>
          </div>
          <div>
            <dt className="text-muted">Resend</dt>
            <dd className="font-semibold">{resendReady ? "Configured" : "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-muted">Total recipients</dt>
            <dd className="font-semibold">{counts.total}</dd>
          </div>
          <div>
            <dt className="text-muted">Active</dt>
            <dd className="font-semibold">{counts.active}</dd>
          </div>
          <div>
            <dt className="text-muted">Waiting for next email</dt>
            <dd className="font-semibold">{counts.waiting}</dd>
          </div>
          <div>
            <dt className="text-muted">Completed</dt>
            <dd className="font-semibold">{counts.completed}</dd>
          </div>
          <div>
            <dt className="text-muted">Unsubscribed</dt>
            <dd className="font-semibold">{counts.unsubscribed}</dd>
          </div>
          <div>
            <dt className="text-muted">Failed</dt>
            <dd className="font-semibold">{counts.failed}</dd>
          </div>
          <div>
            <dt className="text-muted">Emails sent</dt>
            <dd className="font-semibold">{counts.sent}</dd>
          </div>
          <div>
            <dt className="text-muted">Send failures</dt>
            <dd className="font-semibold">{counts.sendFailed}</dd>
          </div>
          <div>
            <dt className="text-muted">Next scheduled send</dt>
            <dd className="font-semibold">
              {counts.nextScheduledAt
                ? new Date(counts.nextScheduledAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })
                : "None"}
            </dd>
          </div>
        </dl>
        <form action={statusAction} className="mt-5 flex flex-wrap gap-2">
          <input type="hidden" name="status" value="active" />
          <SubmitButton disabled={status === "active"}>Activate campaign</SubmitButton>
        </form>
        <form action={statusAction} className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="status" value="paused" />
          <SubmitButton variant="outline" disabled={status !== "active"}>
            Pause sending
          </SubmitButton>
        </form>
        <form action={statusAction} className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="status" value="active" />
          <SubmitButton variant="outline" disabled={status !== "paused"}>
            Resume sending
          </SubmitButton>
        </form>
        <div className="mt-3">
          <ActionBanner state={statusState} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Recipient enrollment"
          description="Nobody is emailed just by opening this page. Preview is a dry-run. Enroll only adds people to the sequence. Sending starts only after activation."
        />
        <form action={previewAction} className="space-y-3">
          <Label htmlFor="source">Source</Label>
          <select
            id="source"
            name="source"
            className="h-10 w-full rounded-lg border border-app bg-card px-3 text-sm"
            defaultValue="buyers"
          >
            <option value="buyers">Previous buyers (successful transactions)</option>
            <option value="students">Enrolled students (LMS profiles)</option>
            <option value="csv">CSV / pasted emails that already exist as students</option>
          </select>
          <Label htmlFor="csv_text">CSV or pasted emails (CSV source only)</Label>
          <textarea
            id="csv_text"
            name="csv_text"
            rows={6}
            className="w-full rounded-lg border border-app bg-card px-3 py-2 text-sm"
            placeholder="email,full_name&#10;ada@example.com,Ada"
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="outline">Dry-run preview</SubmitButton>
          </div>
        </form>
        <form action={enrollAction} className="mt-4 space-y-3">
          <input type="hidden" name="source" id="enroll_source" />
          <input type="hidden" name="csv_text" id="enroll_csv" />
          <SubmitButton
            onClick={(event) => {
              const source = document.querySelector<HTMLSelectElement>("#source");
              const csv = document.querySelector<HTMLTextAreaElement>("#csv_text");
              const sourceInput = event.currentTarget.form?.querySelector<HTMLInputElement>(
                "#enroll_source",
              );
              const csvInput = event.currentTarget.form?.querySelector<HTMLInputElement>("#enroll_csv");
              if (sourceInput && source) sourceInput.value = source.value;
              if (csvInput && csv) csvInput.value = csv.value;
            }}
          >
            Enroll previewed recipients
          </SubmitButton>
        </form>
        <div className="mt-3 space-y-2">
          <ActionBanner state={previewState} />
          <ActionBanner state={enrollState} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Test send"
          description={`Sends one email to an authorized internal address. Default allowlist: ${adminEmail}. Customer addresses are rejected.`}
        />
        <form action={testAction} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="step">Email number</Label>
            <select
              id="step"
              name="step"
              className="h-10 w-full rounded-lg border border-app bg-card px-3 text-sm"
              defaultValue="1"
            >
              {emails.map((email) => (
                <option key={email.day} value={email.day}>
                  Email {email.day} — {email.subject.slice(0, 72)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="test_email">Internal test address</Label>
            <Input id="test_email" name="test_email" type="email" defaultValue={adminEmail} required />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton variant="outline">Send test email</SubmitButton>
          </div>
        </form>
        <div className="mt-3">
          <ActionBanner state={testState} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Email 1–30 preview" description="Copy comes from content/aimoneycode-30-day-email-sequence.md" />
        <div className="space-y-4">
          {emails.map((email) => (
            <details key={email.day} className="rounded-lg border border-app p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Email {email.day}: {email.subject}
              </summary>
              <p className="mt-2 text-xs text-muted">Preview: {email.previewText}</p>
              <p className="mt-1 text-xs text-muted">CTA: {email.ctaLink}</p>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-muted/40 p-3 text-sm leading-relaxed">
                {email.body}
              </pre>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
