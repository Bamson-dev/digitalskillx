const DEFAULT_BRAND = "#dc2626";
const PLATFORM = "DigitalSkillX";
const PARENT = "Pdigital MarketStore Ltd";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailLayout(params: {
  brandColor?: string;
  title: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  supportEmail?: string;
}) {
  const brand = params.brandColor?.trim() || DEFAULT_BRAND;
  const ctaBlock = params.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:10px;background:${brand};">
            <a href="${escapeHtml(params.cta.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(params.cta.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const supportBlock = params.supportEmail
    ? `Questions? Reply to this email or contact us at
       <a href="mailto:${escapeHtml(params.supportEmail)}" style="color:${brand};">${escapeHtml(params.supportEmail)}</a>.`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
          <tr>
            <td style="padding:8px 4px 20px;font-size:20px;font-weight:700;color:${brand};">${PLATFORM}</td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 28px;">
              ${params.bodyHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 8px;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
              ${supportBlock}
              ${supportBlock ? "<br /><br />" : ""}
              ${PLATFORM} by ${PARENT} · RC 8015428 · Lagos, Nigeria
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function courseListHtml(courseNames: string[], brandColor?: string) {
  const brand = brandColor?.trim() || DEFAULT_BRAND;
  const courses = courseNames.length > 0 ? courseNames : ["Your course"];
  return courses
    .map(
      (name) =>
        `<li style="margin:0 0 10px;padding:12px 14px;background:#fef2f2;border-left:4px solid ${brand};border-radius:8px;font-size:15px;font-weight:700;color:#111827;">${escapeHtml(name)}</li>`,
    )
    .join("");
}

export function formatMoney(amountMinor: number, currency: string) {
  const major = amountMinor / 100;
  if (currency === "NGN") return `₦${major.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  return `${currency} ${major.toFixed(2)}`;
}

export function formatEmailDate(iso: string) {
  return new Date(iso).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });
}
