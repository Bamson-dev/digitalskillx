import {
  courseListHtml,
  emailLayout,
  escapeHtml,
  formatEmailDate,
  formatMoney,
} from "@/lib/email/layout";

export type PaymentReceiptEmailParams = {
  firstName: string;
  courseTitle: string;
  amountMinor: number;
  currency: string;
  reference: string;
  paidAt: string;
  courseUrl: string;
  supportEmail: string;
  brandColor?: string;
};

export function paymentReceiptEmail(p: PaymentReceiptEmailParams) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Payment received, ${escapeHtml(p.firstName)}!</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">
      Thank you for your purchase on DigitalSkillX. Your course is unlocked and ready to start.
    </p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;">Receipt details</p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#334155;"><strong>Course:</strong> ${escapeHtml(p.courseTitle)}</p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#334155;"><strong>Amount paid:</strong> ${escapeHtml(formatMoney(p.amountMinor, p.currency))}</p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#334155;"><strong>Reference:</strong> <code style="font-size:13px;background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;">${escapeHtml(p.reference)}</code></p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;"><strong>Date:</strong> ${escapeHtml(formatEmailDate(p.paidAt))}</p>
    </div>`;

  return {
    subject: `Payment receipt — ${p.courseTitle}`,
    html: emailLayout({
      brandColor: p.brandColor,
      title: `Payment receipt — ${p.courseTitle}`,
      bodyHtml,
      cta: { label: "Start your course", url: p.courseUrl },
      supportEmail: p.supportEmail,
    }),
  };
}

export type CourseCompletionCertificateEmailParams = {
  firstName: string;
  courseTitle: string;
  certificateNumber: string;
  certificateUrl: string;
  supportEmail: string;
  brandColor?: string;
};

export function courseCompletionCertificateEmail(p: CourseCompletionCertificateEmailParams) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Congratulations, ${escapeHtml(p.firstName)}!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      You completed <strong>${escapeHtml(p.courseTitle)}</strong> on DigitalSkillX. Brilliant work!
    </p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#065f46;">Your certificate is issued</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">
        Certificate number: <strong>${escapeHtml(p.certificateNumber)}</strong>
      </p>
    </div>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#475569;">
      View and download your certificate anytime. Share it on LinkedIn or with employers to showcase your new skill.
    </p>`;

  return {
    subject: `Certificate ready — ${p.courseTitle}`,
    html: emailLayout({
      brandColor: p.brandColor,
      title: `Certificate ready — ${p.courseTitle}`,
      bodyHtml,
      cta: { label: "View & download certificate", url: p.certificateUrl },
      supportEmail: p.supportEmail,
    }),
  };
}

export type IdleReminderEmailParams = {
  firstName: string;
  courseTitle: string;
  progressPct: number;
  resumeUrl: string;
  supportEmail: string;
  brandColor?: string;
};

export function idleReminderEmail(p: IdleReminderEmailParams) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Hi ${escapeHtml(p.firstName)},</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      You started <strong>${escapeHtml(p.courseTitle)}</strong> but haven&apos;t been back in a few days. Pick up where you left off — your progress is saved.
    </p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">${escapeHtml(p.courseTitle)}</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">Current progress: <strong>${p.progressPct}%</strong></p>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
      Jump back in with one click — we&apos;ll take you to the exact lesson you stopped at.
    </p>`;

  return {
    subject: `Continue ${p.courseTitle} on DigitalSkillX`,
    html: emailLayout({
      brandColor: p.brandColor,
      title: `Continue ${p.courseTitle}`,
      bodyHtml,
      cta: { label: "Resume learning", url: p.resumeUrl },
      supportEmail: p.supportEmail,
    }),
  };
}

export { courseListHtml };
