import { escapeHtml } from "../email/layout";
import { ORG } from "../org";
import { campaignTrackingUrl, webinarPersonalFirstName, WEBINAR_FOLLOWUP_OFFER_URL } from "./constants";

export type SequenceEmailContent = {
  stepNumber: number;
  internalTitle: string;
  /** Recommended primary subject used for sends. */
  subject: string;
  /** Two alternative subjects for admin review / A-B consideration. */
  altSubjects: [string, string];
  previewText: string;
  bodyText: string;
  ctaLabel: string;
  ctaUrl: string;
  delayHours: number;
  /** Conversion / psychological angle for this step. */
  angle: string;
  /** Content phase/category label. */
  category: string;
};

function greeting(firstName: string | null | undefined): string {
  return webinarPersonalFirstName(firstName) ?? "";
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function linkifyDisplayUrls(html: string, href: string, display: string): string {
  const safeHref = escapeHtml(href);
  const safeDisplay = escapeHtml(display);
  return html.replace(
    /(https:\/\/aimoneycode\.com\.ng\/(?:reg|offer))/gi,
    `<a href="${safeHref}" style="color:#b91c1c;font-weight:700;text-decoration:underline;">${safeDisplay}</a>`,
  );
}

function prepareBody(body: string): string {
  return body.replace(/\s*:\s*\{\{cta_url\}\}\s*/gi, ".").replace(/\{\{cta_url\}\}/gi, "").trim();
}

function bodyToHtml(body: string, trackedCta: string, displayCta: string): string {
  const prepared = prepareBody(body);
  const paragraphs = prepared.split(/\n{2,}/);
  return paragraphs
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^[-*] /.test(trimmed) || trimmed.split("\n").every((l) => /^[-*] /.test(l.trim()) || !l.trim())) {
        const items = trimmed
          .split("\n")
          .map((l) => l.replace(/^[-*]\s+/, "").trim())
          .filter(Boolean);
        return `<ul style="margin:0 0 18px;padding-left:22px;">${items
          .map((item) => `<li style="margin:0 0 8px;line-height:1.65;font-size:16px;color:#0f172a;">${inlineMarkdown(item)}</li>`)
          .join("")}</ul>`;
      }
      const lines = trimmed.split("\n").map((l) => inlineMarkdown(l)).join("<br/>");
      return `<p style="margin:0 0 16px;line-height:1.75;font-size:17px;color:#0f172a;">${linkifyDisplayUrls(lines, trackedCta, displayCta)}</p>`;
    })
    .join("");
}

export function renderWebinarFollowupEmail(params: {
  email: SequenceEmailContent;
  firstName?: string | null;
  campaignSlug: string;
  unsubscribeUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const ctaBase = params.email.ctaUrl || WEBINAR_FOLLOWUP_OFFER_URL;
  const tracked = campaignTrackingUrl(ctaBase, params.campaignSlug, params.email.stepNumber);
  const name = greeting(params.firstName);
  const open = name ? `${name},` : "";
  let body = params.email.bodyText;
  if (open && !/^\s*[A-Za-zÀ-ÿ'’-]+,/.test(body)) {
    body = `${open}\n\n${body}`;
  }

  const bodyHtml = bodyToHtml(body, tracked, ctaBase);
  const unsub = params.unsubscribeUrl
    ? `<p style="margin:14px 8px 0;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;font-family:Arial,Helvetica,sans-serif;">
        Prefer not to get these?
        <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>
      </p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(params.email.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Georgia,'Times New Roman',serif;color:#0f172a;">
  ${params.email.previewText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.email.previewText)}</div>` : ""}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
        <tr>
          <td style="padding:0 8px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">
            ${escapeHtml(ORG.platformName)}
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:36px 32px;">
            ${bodyHtml}
            <p style="margin:8px 0 18px;font-size:17px;line-height:1.7;color:#0f172a;">
              If this still matters to you, open the next step now — the full picture is there, and the only way this becomes useful is if you act on it.
            </p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 8px;">
              <tr>
                <td style="border-radius:8px;background:#dc2626;">
                  <a href="${escapeHtml(tracked)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">
                    ${escapeHtml(params.email.ctaLabel || "See The Full Offer")}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
            ${escapeHtml(ORG.platformName)} · ${escapeHtml(ORG.location)}
            ${unsub}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${prepareBody(body)}

${params.email.ctaLabel}: ${ctaBase}
${params.unsubscribeUrl ? `\nUnsubscribe: ${params.unsubscribeUrl}` : ""}`;

  return { subject: params.email.subject, html, text };
}
