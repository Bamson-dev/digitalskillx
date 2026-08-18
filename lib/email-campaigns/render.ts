import { escapeHtml } from "../email/layout";
import { ORG } from "../org";
import {
  campaignTrackingUrl,
  ctaLabelForStep,
  ctaUrlForStep,
} from "./constants";
import { applyCampaignGreeting } from "./greeting";
import type { ParsedCampaignEmail } from "./parse-sequence";

function escapeExceptAllowed(text: string): string {
  return escapeHtml(text);
}

function inlineMarkdown(text: string): string {
  const escaped = escapeExceptAllowed(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function rewriteCtaUrls(text: string, stepNumber: number): string {
  const webinar = campaignTrackingUrl(ctaUrlForStep(Math.min(stepNumber, 10)), stepNumber);
  const offer = campaignTrackingUrl(ctaUrlForStep(Math.max(stepNumber, 11)), stepNumber);
  const dest = campaignTrackingUrl(ctaUrlForStep(stepNumber), stepNumber);
  return text
    .replace(/https?:\/\/aimoneycode\.com\.ng\/reg/gi, dest)
    .replace(/https?:\/\/aimoneycode\.com\.ng\/offer/gi, dest)
    .replace(/(^|[\s(])aimoneycode\.com\.ng\/reg/gi, `$1${webinar}`)
    .replace(/(^|[\s(])aimoneycode\.com\.ng\/offer/gi, `$1${offer}`);
}

function linkify(html: string, stepNumber: number): string {
  const dest = campaignTrackingUrl(ctaUrlForStep(stepNumber), stepNumber);
  return html.replace(
    /(https:\/\/aimoneycode\.com\.ng\/(?:reg|offer)(?:\?[^\s<]*)?)/gi,
    (url) =>
      `<a href="${escapeHtml(url)}" style="color:#dc2626;font-weight:700;text-decoration:underline;">${escapeHtml(url.split("?")[0] ?? dest)}</a>`,
  );
}

function bodyToHtml(body: string, stepNumber: number): string {
  const rewritten = rewriteCtaUrls(body, stepNumber);
  const lines = rewritten.split(/\n/);
  const html: string[] = [];
  let list: string[] = [];
  let tableRows: string[][] = [];

  function flushList() {
    if (!list.length) return;
    html.push(
      `<ul style="margin:0 0 16px;padding-left:20px;">${list
        .map((item) => `<li style="margin:0 0 8px;line-height:1.6;">${inlineMarkdown(item)}</li>`)
        .join("")}</ul>`,
    );
    list = [];
  }

  function flushTable() {
    if (!tableRows.length) return;
    const [header, ...rows] = tableRows[0]?.every((c) => /^-+$/.test(c))
      ? [tableRows[0], ...tableRows.slice(1)]
      : tableRows;
    const isSeparator = (row: string[]) => row.every((c) => /^:?-{3,}:?$/.test(c));
    const start = header && !isSeparator(header) ? header : tableRows[1];
    const data = tableRows.filter((row, i) => i > 0 && !isSeparator(row));
    if (start && !isSeparator(start)) {
      html.push(`<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border-collapse:collapse;width:100%;font-size:14px;">
        <tr>${start.map((c) => `<th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e2e8f0;">${inlineMarkdown(c)}</th>`).join("")}</tr>
        ${data
          .map(
            (row) =>
              `<tr>${row
                .map((c) => `<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${inlineMarkdown(c)}</td>`)
                .join("")}</tr>`,
          )
          .join("")}
      </table>`);
    }
    tableRows = [];
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const tableMatch = /^\|(.+)\|$/.exec(line);
    if (tableMatch) {
      flushList();
      tableRows.push(
        tableMatch[1]
          .split("|")
          .map((c) => c.trim())
          .filter((c, i, arr) => !(i === arr.length - 1 && c === "")),
      );
      continue;
    }
    flushTable();

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();

    if (!line.trim()) {
      continue;
    }
    html.push(
      `<p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#0f172a;">${linkify(inlineMarkdown(line), stepNumber)}</p>`,
    );
  }
  flushList();
  flushTable();
  return html.join("\n");
}

export function renderCampaignEmailHtml(params: {
  email: ParsedCampaignEmail;
  stepNumber: number;
  fullName?: string | null;
  unsubscribeUrl?: string | null;
}): { subject: string; html: string; previewText: string; ctaUrl: string } {
  const { email, stepNumber } = params;
  const ctaUrl = campaignTrackingUrl(ctaUrlForStep(stepNumber), stepNumber);
  const personalized = applyCampaignGreeting(email.body, params.fullName);
  const bodyHtml = bodyToHtml(personalized, stepNumber);
  const preview = escapeHtml(email.previewText || email.subject);
  const unsub = params.unsubscribeUrl
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">
        If you no longer want emails about this program,
        <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#64748b;text-decoration:underline;">unsubscribe here</a>.
      </p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(email.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Georgia,'Times New Roman',serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px 28px;">
          <tr>
            <td>
              ${bodyHtml}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 20px;">
                <tr>
                  <td style="border-radius:8px;background:#dc2626;">
                    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(ctaLabelForStep(stepNumber))}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:16px 8px 0;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;font-family:Arial,Helvetica,sans-serif;">
          ${escapeHtml(ORG.platformName)} by ${escapeHtml(ORG.name)} · ${escapeHtml(ORG.rc)} · ${escapeHtml(ORG.location)}
        </p>
        ${unsub}
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: email.subject,
    html,
    previewText: email.previewText,
    ctaUrl,
  };
}
