import { escapeHtml } from "../email/layout";
import { ORG } from "../org";
import { campaignTrackingUrl, WEBINAR_FOLLOWUP_OFFER_URL } from "./constants";

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
  const name = (firstName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!name || /^(null|undefined|n\/a|na|-)$/i.test(name)) return "";
  return name;
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function bodyToHtml(body: string, trackedCta: string): string {
  const withCta = body.replace(/\{\{cta_url\}\}/gi, trackedCta);
  const paragraphs = withCta.split(/\n{2,}/);
  return paragraphs
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^[-*] /.test(trimmed) || trimmed.split("\n").every((l) => /^[-*] /.test(l.trim()) || !l.trim())) {
        const items = trimmed
          .split("\n")
          .map((l) => l.replace(/^[-*]\s+/, "").trim())
          .filter(Boolean);
        return `<ul style="margin:0 0 16px;padding-left:20px;">${items
          .map((item) => `<li style="margin:0 0 8px;line-height:1.6;">${inlineMarkdown(item)}</li>`)
          .join("")}</ul>`;
      }
      const lines = trimmed.split("\n").map((l) => inlineMarkdown(l)).join("<br/>");
      return `<p style="margin:0 0 16px;line-height:1.7;font-size:16px;color:#111827;">${lines}</p>`;
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

  const bodyHtml = bodyToHtml(body, tracked);
  const unsub = params.unsubscribeUrl
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
        Prefer not to get these? <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
      </p>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
${params.email.previewText ? `<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(params.email.previewText)}</span>` : ""}
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:28px 24px;">
        <tr><td>
          <p style="margin:0 0 20px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#9ca3af;">${escapeHtml(ORG.name)}</p>
          ${bodyHtml}
          <p style="margin:8px 0 24px;">
            <a href="${escapeHtml(tracked)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px;">
              ${escapeHtml(params.email.ctaLabel || "See The Full Offer")}
            </a>
          </p>
          <p style="margin:0;font-size:13px;color:#6b7280;">
            Or open: <a href="${escapeHtml(tracked)}" style="color:#111827;">${escapeHtml(ctaBase)}</a>
          </p>
          ${unsub}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${body.replace(/\{\{cta_url\}\}/gi, tracked)}

${params.email.ctaLabel}: ${tracked}
${params.unsubscribeUrl ? `\nUnsubscribe: ${params.unsubscribeUrl}` : ""}`;

  return { subject: params.email.subject, html, text };
}
