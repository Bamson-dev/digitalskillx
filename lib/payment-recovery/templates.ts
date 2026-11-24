/**
 * Recovery email templates. Pure HTML strings with inline styles for Gmail and mobile.
 * Brand matches lib/email/templates.ts (red #dc2626, slate text, white card).
 */
import { RECOVERY_BUSINESS, formatNaira, whatsappLink } from "./config";

export type RecoveryStep =
  | "initial"
  | "followup_3h"
  | "help_12h"
  | "reminder_24h"
  | "reminder_48h"
  | "reminder_72h"
  | "final_120h"
  | "manual"
  | "final_48h"; // legacy value from the old three-email sequence

export type RecoveryEmailInput = {
  step: RecoveryStep;
  firstName: string | null;
  productTitle: string;
  amountKobo: number;
  bankReference: string;
  retryUrl: string;
  optOutUrl: string;
  reason: "failed" | "abandoned";
  /** Real course description from the database. Never invented. */
  productSummary?: string | null;
};

const BRAND = "#dc2626";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function firstNameFrom(fullName: string | null | undefined) {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first.length > 40 || /[@\d]/.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function recoverySubject(step: RecoveryStep, productTitle: string) {
  switch (step) {
    case "followup_3h":
      return "Would you like to try your payment again?";
    case "help_12h":
      return `You can still complete your ${productTitle} purchase`;
    case "reminder_24h":
      return `Still interested in ${productTitle}?`;
    case "reminder_48h":
      return "Need help completing your payment?";
    case "reminder_72h":
      return `Your ${productTitle} order is still incomplete`;
    case "final_120h":
    case "final_48h":
      return `Last reminder about your ${productTitle} checkout`;
    default:
      return `Your ${productTitle} payment is not complete`;
  }
}

function summaryBlock(input: RecoveryEmailInput) {
  const raw = (input.productSummary ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const text = raw.length > 320 ? `${raw.slice(0, 317).trimEnd()}...` : raw;
  return `<p style="margin:12px 0;padding:12px 14px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.7;color:#334155">${esc(text)}</p>`;
}

/** Plain, direct copy. One different purpose per email. No invented claims, prices or deadlines. */
function intro(input: RecoveryEmailInput, product: string, amount: string) {
  switch (input.step) {
    case "followup_3h":
      return `Your payment for <strong>${product}</strong> (${amount}) has not gone through yet. Cards sometimes fail because of bank limits or network problems, and that is easy to fix. You can try again with the button below, or ask us for help on WhatsApp if you get stuck.`;
    case "help_12h":
      return `You can still complete your <strong>${product}</strong> purchase (${amount}). If your card or Paystack gives you trouble, pay by bank transfer instead. The account details are in Option 2 below. Copy them and use your payment reference as the narration.`;
    case "reminder_24h":
      return `A day ago you started an order for <strong>${product}</strong>. Here is what it is, so you can decide:${summaryBlock(input)}Your order (${amount}) is still open. Pay online or by bank transfer using the options below.`;
    case "reminder_48h":
      return `If something stopped you from paying for <strong>${product}</strong>, tell us. The usual problems are: the card is declined, the bank blocks the online payment, or the transfer does not show. All three have a fix. Message us on WhatsApp and we will help you through it, or use the options below.`;
    case "reminder_72h":
      return `Your <strong>${product}</strong> order (${amount}) is still incomplete. Nothing has been charged. When you are ready, finish with the card button or a bank transfer below.`;
    case "final_120h":
    case "final_48h":
      return `This is the last automated reminder about your <strong>${product}</strong> order (${amount}). We will not send more reminders for this order. If you still want the course, you can pay with any option below, or message us on WhatsApp and we will help.`;
    default: {
      const what =
        input.reason === "failed"
          ? "but the payment did not go through"
          : "but we could not confirm a successful payment";
      return `You recently tried to buy <strong>${product}</strong> on DigitalSkillX, ${what}. Your order is still waiting for payment. You can finish it with any option below.`;
    }
  }
}

function button(href: string, label: string, color: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0 8px"><tr><td style="border-radius:8px;background:${color}"><a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;font-family:Arial,Helvetica,sans-serif">${label}</a></td></tr></table>`;
}

function section(title: string, body: string) {
  return `<div style="margin:24px 0 0;padding:20px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff">
<p style="margin:0 0 8px;font-size:13px;font-weight:bold;letter-spacing:0.04em;color:${BRAND}">${title}</p>${body}</div>`;
}

const P = 'style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#334155"';

export function renderRecoveryEmail(input: RecoveryEmailInput) {
  const product = esc(input.productTitle);
  const amount = formatNaira(input.amountKobo);
  const ref = esc(input.bankReference);
  const wa = whatsappLink({
    productTitle: input.productTitle,
    amountKobo: input.amountKobo,
    bankReference: input.bankReference,
  });
  const greeting = input.firstName ? `Hello ${esc(input.firstName)},` : "Hello,";
  const subject = recoverySubject(input.step, input.productTitle);

  const bankRows = [
    ["Bank", RECOVERY_BUSINESS.bankName],
    ["Account name", RECOVERY_BUSINESS.accountName],
    ["Account number", RECOVERY_BUSINESS.accountNumber],
    ["Amount", amount],
    ["Payment reference", input.bankReference],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:#64748b;white-space:nowrap">${k}</td><td style="padding:6px 0;font-size:16px;font-weight:bold;color:#0f172a;font-family:'Courier New',Courier,monospace">${esc(v)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:600px;margin:0 auto;padding:24px 14px">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:${BRAND}">DigitalSkillX</p>
<div style="background:#ffffff;border-radius:12px;padding:28px 22px;border:1px solid #e2e8f0">
<p ${P}>${greeting}</p>
<p ${P}>${intro(input, product, amount)}</p>
<table role="presentation" style="width:100%;margin:8px 0 4px;border-collapse:collapse;background:#f8fafc;border-radius:8px">
<tr><td style="padding:12px 14px;font-size:14px;color:#64748b">Product</td><td style="padding:12px 14px;font-size:15px;font-weight:bold;color:#0f172a;text-align:right">${product}</td></tr>
<tr><td style="padding:0 14px 12px;font-size:14px;color:#64748b">Amount</td><td style="padding:0 14px 12px;font-size:15px;font-weight:bold;color:#0f172a;text-align:right">${amount}</td></tr>
</table>
${section(
  "OPTION 1: PAY ONLINE",
  `<p ${P}>Click the button below. It opens a new, secure Paystack checkout for ${product} at ${amount}. You can pay with card, bank transfer or USSD on Paystack.</p>${button(input.retryUrl, "COMPLETE MY PAYMENT", BRAND)}`,
)}
${section(
  "OPTION 2: PAY THROUGH BANK TRANSFER",
  `<p ${P}>Transfer the exact amount to this account:</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 12px">${bankRows}</table>
<p ${P}>Please write <strong>${ref}</strong> in your transfer narration (description), so we can match your payment.</p>
<p ${P}>After you transfer, send us a message on WhatsApp so we can confirm it quickly. Course access starts after we confirm the money in our account. A screenshot alone does not confirm payment.</p>`,
)}
${section(
  "OPTION 3: GET HELP ON WHATSAPP",
  `<p ${P}>If anything is not clear, or your card keeps failing, chat with us on WhatsApp (${RECOVERY_BUSINESS.whatsappLocal}). We will help you finish your purchase.</p>${button(wa, "CHAT WITH US ON WHATSAPP", "#16a34a")}`,
)}
<p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#334155">Thank you for choosing DigitalSkillX.<br/>The DigitalSkillX Team</p>
</div>
<p style="font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;margin:22px 0 0">You received this email because you started a purchase on DigitalSkillX.<br/><a href="${esc(input.optOutUrl)}" style="color:#94a3b8">Stop payment reminders for this order</a><br/>DigitalSkillX by Pdigital MarketStore Ltd · RC 8015428 · Lagos, Nigeria</p>
</div></body></html>`;

  return { subject, html };
}
