"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  seedWebinarSequenceAction,
  setWebinarCampaignStatusAction,
  testSendWebinarFollowupEmail,
  type WfuActionState,
} from "@/app/(admin)/admin/(panel)/webinar-follow-up/actions";
import { maskEmail } from "@/lib/webinar-followup/constants";

type Counts = {
  total: number;
  active: number;
  waiting: number;
  completed: number;
  unsubscribed: number;
  failed: number;
  paused: number;
  sent: number;
  sendFailed: number;
  dueNow: number;
  nextScheduledAt: string | null;
};

type Step = {
  stepNumber: number;
  subject: string;
  altSubjects: [string, string];
  previewText: string;
  delayHours: number;
  status: string;
  ctaLabel: string;
  ctaUrl?: string;
  bodyText: string;
  angle: string;
  category: string;
  internalTitle: string;
};

type ImportRow = Record<string, unknown>;
type ContactRow = Record<string, unknown>;
type SendRow = Record<string, unknown>;

const empty: WfuActionState = {};

export function WebinarFollowupCampaignPanel(props: {
  campaignId: string;
  campaignName: string;
  slug: string;
  status: string;
  description: string;
  offerUrl: string;
  offerPrice: string;
  offerValue: string;
  counts: Counts;
  steps: Step[];
  imports: ImportRow[];
  contacts: ContactRow[];
  sends: SendRow[];
  sendsByStep: Array<{ step: number; count: number }>;
  adminEmail: string;
  resendReady: boolean;
  migrationRequired: boolean;
}) {
  const router = useRouter();
  const [statusState, statusAction] = useFormState(setWebinarCampaignStatusAction, empty);
  const [seedState, seedAction] = useFormState(seedWebinarSequenceAction, empty);
  const [testState, testAction] = useFormState(testSendWebinarFollowupEmail, empty);

  const [stepFilter, setStepFilter] = useState("");
  const [previewStep, setPreviewStep] = useState<number | null>(null);
  const [showSequence, setShowSequence] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showSends, setShowSends] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [emailColumn, setEmailColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(
    () => props.steps.find((s) => s.stepNumber === previewStep) ?? null,
    [previewStep, props.steps],
  );

  const filteredSteps = useMemo(() => {
    const q = stepFilter.trim().toLowerCase();
    if (!q) return props.steps;
    return props.steps.filter(
      (s) =>
        String(s.stepNumber).includes(q) ||
        s.subject.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.internalTitle.toLowerCase().includes(q),
    );
  }, [props.steps, stepFilter]);

  async function importNewContacts() {
    if (!csvFile) return;
    if (props.status === "archived") {
      setImportErr("Campaign is archived. Resume/restore before importing.");
      return;
    }
    setImportErr(null);
    setImportMsg(null);
    setImportResult(null);
    const form = new FormData();
    form.set("file", csvFile);
    if (emailColumn.trim()) form.set("email_column", emailColumn.trim());
    if (nameColumn.trim()) form.set("first_name_column", nameColumn.trim());

    startTransition(async () => {
      const res = await fetch(`/api/admin/webinar-follow-up/${props.campaignId}/import`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        if (Array.isArray(json.headers)) setHeaders(json.headers as string[]);
        if (json.guess && typeof json.guess === "object") {
          const g = json.guess as { emailColumn?: string; firstNameColumn?: string };
          if (g.emailColumn && !emailColumn) setEmailColumn(g.emailColumn);
          if (g.firstNameColumn && !nameColumn) setNameColumn(g.firstNameColumn);
        }
        setImportErr(String(json.error ?? `Import failed (${res.status})`));
        return;
      }
      setImportResult(json);
      setImportMsg("Import complete");
      setCsvFile(null);
      router.refresh();
    });
  }

  const archived = props.status === "archived";
  const canActivate = props.steps.length === 40 && props.status !== "active";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Webinar Follow-Up</p>
          <h1 className="text-2xl font-bold">{props.campaignName}</h1>
          <p className="mt-1 text-sm text-muted">{props.description}</p>
          <p className="mt-2 text-xs text-muted">
            {props.offerPrice} · stated value {props.offerValue} · 40 emails ·{" "}
            <a href={props.offerUrl} className="underline" target="_blank" rel="noreferrer">
              Offer page
            </a>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white px-4 py-3 text-sm">
          Status: <span className="font-semibold capitalize">{props.status}</span>
        </div>
      </div>

      {props.migrationRequired ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Migration 0048 is required before contacts or sends can be stored.
        </p>
      ) : null}

      {/* Overview */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Total contacts", props.counts.total],
            ["Active / progressing", props.counts.active],
            ["Completed", props.counts.completed],
            ["Unsubscribed", props.counts.unsubscribed],
            ["Failed", props.counts.failed],
            ["Total sent", props.counts.sent],
            ["Send failures", props.counts.sendFailed],
            ["Ready for next email", props.counts.dueNow],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-white px-4 py-3">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Sequence: {props.steps.length}/40 loaded · Next scheduled:{" "}
          {props.counts.nextScheduledAt
            ? new Date(props.counts.nextScheduledAt).toLocaleString()
            : "—"}
        </p>
      </section>

      {/* Campaign controls */}
      <section className="rounded-xl border border-border bg-white p-4 space-y-4">
        <h2 className="text-lg font-semibold">Campaign controls</h2>
        <p className="text-sm text-muted">
          Draft = import allowed, no sends. Active = automatic sending. Paused = stop sends, keep
          progress. Archived = no sends and no new imports.
        </p>
        <div className="flex flex-wrap gap-2">
          {canActivate ? (
            <form
              action={statusAction}
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    "Activate this campaign?\n\nNew imported contacts will automatically enter the sequence at Email 1. Existing contacts will continue from their current position.\n\nEmails send from the server — you can close this page.",
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="campaign_id" value={props.campaignId} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton disabled={!props.resendReady}>Activate Campaign</SubmitButton>
            </form>
          ) : null}
          {props.status === "active" ? (
            <form action={statusAction}>
              <input type="hidden" name="campaign_id" value={props.campaignId} />
              <input type="hidden" name="status" value="paused" />
              <SubmitButton>Pause Campaign</SubmitButton>
            </form>
          ) : null}
          {props.status === "paused" ? (
            <form
              action={statusAction}
              onSubmit={(e) => {
                if (
                  !window.confirm(
                    "Resume this campaign?\n\nContacts will continue from their current position. Due emails will send from the server.",
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="campaign_id" value={props.campaignId} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton>Resume Campaign</SubmitButton>
            </form>
          ) : null}
          {props.status !== "archived" && props.status !== "draft" ? (
            <form action={statusAction}>
              <input type="hidden" name="campaign_id" value={props.campaignId} />
              <input type="hidden" name="status" value="archived" />
              <SubmitButton>Archive</SubmitButton>
            </form>
          ) : null}
          {props.status === "archived" ? (
            <form action={statusAction}>
              <input type="hidden" name="campaign_id" value={props.campaignId} />
              <input type="hidden" name="status" value="draft" />
              <SubmitButton>Restore to draft</SubmitButton>
            </form>
          ) : null}
        </div>
        {props.steps.length < 40 ? (
          <form action={seedAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="campaign_id" value={props.campaignId} />
            {props.steps.length > 0 ? <input type="hidden" name="force" value="1" /> : null}
            <SubmitButton>Load 40-email sequence</SubmitButton>
            <span className="text-xs text-muted">Required before first activation.</span>
          </form>
        ) : (
          <form action={seedAction}>
            <input type="hidden" name="campaign_id" value={props.campaignId} />
            <input type="hidden" name="force" value="1" />
            <button type="submit" className="text-xs text-muted underline">
              Re-sync sequence from source (advanced)
            </button>
          </form>
        )}
        {statusState.error ? <p className="text-sm text-red-700">{statusState.error}</p> : null}
        {statusState.message ? <p className="text-sm text-green-700">{statusState.message}</p> : null}
        {seedState.error ? <p className="text-sm text-red-700">{seedState.error}</p> : null}
        {seedState.message ? <p className="text-sm text-green-700">{seedState.message}</p> : null}
      </section>

      {/* Import CSV — primary workflow */}
      <section className="space-y-3 rounded-xl border border-border bg-white p-4">
        <h2 className="text-lg font-semibold">Import CSV</h2>
        <p className="text-sm text-muted">
          Upload a WebinarJam export and click <strong>Import New Contacts</strong>. Only new
          emails are added. Existing contacts keep their current step. Suppressed emails are
          skipped.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="csv">CSV file</Label>
            <Input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setCsvFile(e.target.files?.[0] ?? null);
                setImportResult(null);
                setImportMsg(null);
                setImportErr(null);
              }}
              disabled={archived || pending}
            />
          </div>
          <div>
            <Label htmlFor="email_col">Email column (only if auto-detect fails)</Label>
            <Input
              id="email_col"
              value={emailColumn}
              onChange={(e) => setEmailColumn(e.target.value)}
              placeholder="Usually auto-detected"
              list="wfu-headers"
            />
            {headers.length > 0 ? (
              <datalist id="wfu-headers">
                {headers.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            ) : null}
          </div>
          <div>
            <Label htmlFor="name_col">First name column (optional)</Label>
            <Input
              id="name_col"
              value={nameColumn}
              onChange={(e) => setNameColumn(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={importNewContacts}
          disabled={!csvFile || pending || archived}
        >
          {pending ? "Importing…" : "Import New Contacts"}
        </Button>
        {importErr ? <p className="text-sm text-red-700">{importErr}</p> : null}
        {importMsg ? <p className="text-sm font-medium text-green-700">{importMsg}</p> : null}
        {importResult ? (
          <div className="grid gap-2 rounded-lg border border-border bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <div>
              Total rows: <strong>{String(importResult.totalRows ?? "—")}</strong>
            </div>
            <div>
              Valid emails: <strong>{String(importResult.validEmails ?? "—")}</strong>
            </div>
            <div>
              Invalid skipped: <strong>{String(importResult.invalidEmails ?? "—")}</strong>
            </div>
            <div>
              Duplicates in file: <strong>{String(importResult.duplicatesInFile ?? "—")}</strong>
            </div>
            <div>
              Already in campaign: <strong>{String(importResult.existingSkipped ?? "—")}</strong>
            </div>
            <div>
              Suppressed skipped: <strong>{String(importResult.suppressedSkipped ?? "—")}</strong>
            </div>
            <div>
              New contacts added: <strong>{String(importResult.newlyAdded ?? "—")}</strong>
            </div>
            {importResult.counts && typeof importResult.counts === "object" ? (
              <>
                <div>
                  Now progressing:{" "}
                  <strong>{String((importResult.counts as Counts).active ?? "—")}</strong>
                </div>
                <div>
                  Completed:{" "}
                  <strong>{String((importResult.counts as Counts).completed ?? "—")}</strong>
                </div>
                <div>
                  Ready for next email:{" "}
                  <strong>{String((importResult.counts as Counts).dueNow ?? "—")}</strong>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Test send */}
      <section className="rounded-xl border border-border bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold">Send test email</h2>
        <p className="text-sm text-muted">
          Sends <code>[TEST]</code> only to allowed addresses. Does not enroll or advance anyone.
        </p>
        <form action={testAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="campaign_id" value={props.campaignId} />
          <div>
            <Label htmlFor="step">Step</Label>
            <Input id="step" name="step" type="number" min={1} max={40} defaultValue={1} className="w-24" />
          </div>
          <div>
            <Label htmlFor="test_email">Send to</Label>
            <Input id="test_email" name="test_email" type="email" defaultValue={props.adminEmail} required />
          </div>
          <SubmitButton disabled={!props.resendReady || props.steps.length === 0}>Send test</SubmitButton>
        </form>
        {testState.error ? <p className="text-sm text-red-700">{testState.error}</p> : null}
        {testState.message ? <p className="text-sm text-green-700">{testState.message}</p> : null}
      </section>

      {/* Sequence (collapsible) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Email sequence ({props.steps.length}/40)</h2>
          <Button type="button" variant="outline" onClick={() => setShowSequence((v) => !v)}>
            {showSequence ? "Hide" : "Review emails"}
          </Button>
        </div>
        {showSequence ? (
          <>
            <Input
              value={stepFilter}
              onChange={(e) => setStepFilter(e.target.value)}
              placeholder="Search subject, category, or step #"
            />
            <div className="overflow-hidden rounded-xl border border-border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Delay</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSteps.map((s) => (
                    <tr key={s.stepNumber} className="border-b last:border-0">
                      <td className="px-3 py-2">{s.stepNumber}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{s.subject}</div>
                        <div className="text-xs text-muted">{s.category}</div>
                      </td>
                      <td className="px-3 py-2">{s.delayHours}h</td>
                      <td className="px-3 py-2 text-right">
                        <Button type="button" variant="outline" onClick={() => setPreviewStep(s.stepNumber)}>
                          Preview
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview ? (
              <div className="rounded-xl border border-border bg-slate-50 p-4 text-sm space-y-2">
                <div className="font-semibold">
                  Email {preview.stepNumber} — {preview.internalTitle}
                </div>
                <div>Primary: {preview.subject}</div>
                <div className="text-muted">
                  Alts: {preview.altSubjects[0]} · {preview.altSubjects[1]}
                </div>
                <div className="text-muted">CTA: {preview.ctaLabel}</div>
                <div className="whitespace-pre-wrap border-t pt-3">{preview.bodyText}</div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {/* Step sends summary */}
      {props.sendsByStep.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Sends by step</h2>
          <p className="text-sm text-muted">
            {props.sendsByStep.map((s) => `E${s.step}:${s.count}`).join(" · ")}
          </p>
        </section>
      ) : null}

      {/* Import history */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Import history</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Rows</th>
                <th className="px-3 py-2">New</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {props.imports.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-muted">
                    No imports yet.
                  </td>
                </tr>
              ) : (
                props.imports.map((row) => (
                  <tr key={String(row.id)} className="border-b last:border-0">
                    <td className="px-3 py-2">{String(row.file_name)}</td>
                    <td className="px-3 py-2">{String(row.total_rows)}</td>
                    <td className="px-3 py-2">{String(row.newly_enrolled)}</td>
                    <td className="px-3 py-2">
                      {row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Contacts (collapsible) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Contact progress</h2>
          <Button type="button" variant="outline" onClick={() => setShowContacts((v) => !v)}>
            {showContacts ? "Hide" : "Show"}
          </Button>
        </div>
        {showContacts ? (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Next send</th>
                </tr>
              </thead>
              <tbody>
                {props.contacts.map((row) => (
                  <tr key={String(row.id)} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {maskEmail(String(row.email ?? ""))}
                    </td>
                    <td className="px-3 py-2">{String(row.current_step)}</td>
                    <td className="px-3 py-2 capitalize">{String(row.status)}</td>
                    <td className="px-3 py-2">
                      {row.next_send_at
                        ? new Date(String(row.next_send_at)).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Recent sends (collapsible) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent send activity</h2>
          <Button type="button" variant="outline" onClick={() => setShowSends((v) => !v)}>
            {showSends ? "Hide" : "Show"}
          </Button>
        </div>
        {showSends ? (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-muted">
                <tr>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Attempts</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {props.sends.map((row) => (
                  <tr key={String(row.id)} className="border-b last:border-0">
                    <td className="px-3 py-2">{String(row.step_number)}</td>
                    <td className="px-3 py-2">{String(row.status)}</td>
                    <td className="px-3 py-2">{String(row.attempts)}</td>
                    <td className="px-3 py-2">
                      {row.updated_at ? new Date(String(row.updated_at)).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
