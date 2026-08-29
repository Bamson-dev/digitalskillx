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
  kind?: "course" | "learning_path";
  verifyUrl?: string;
};

export function courseCompletionCertificateEmail(p: CourseCompletionCertificateEmailParams) {
  const isLearningPath = p.kind === "learning_path";
  const intro = isLearningPath
    ? `This certificate recognizes that you completed the DigitalSkillX learning path <strong>${escapeHtml(p.courseTitle)}</strong>.`
    : `You completed <strong>${escapeHtml(p.courseTitle)}</strong> on DigitalSkillX. Brilliant work!`;
  const verifyLine = p.verifyUrl
    ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#334155;">Verify: <a href="${escapeHtml(p.verifyUrl)}" style="color:#b91c1c;text-decoration:underline;">${escapeHtml(p.verifyUrl)}</a></p>`
    : "";
  const attribution = isLearningPath
    ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#64748b;">Lessons embed original YouTube videos. DigitalSkillX organizes public educational content into a learning path and does not claim a partnership with the creator.</p>`
    : "";
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Congratulations, ${escapeHtml(p.firstName)}!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      ${intro}
    </p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#065f46;">Your DigitalSkillX certificate is issued</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">
        Certificate number: <strong>${escapeHtml(p.certificateNumber)}</strong>
      </p>
      ${verifyLine}
    </div>
    ${attribution}
    <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#475569;">
      View and download your certificate anytime. Share the verification link on LinkedIn or with employers.
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

export type CourseEnrollmentEmailParams = {
  firstName: string;
  courseTitle: string;
  courseUrl: string;
  loginUrl: string;
  supportEmail: string;
  brandColor?: string;
};

export function courseEnrollmentEmail(p: CourseEnrollmentEmailParams) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">You're enrolled, ${escapeHtml(p.firstName)}!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      You now have access to <strong>${escapeHtml(p.courseTitle)}</strong> on DigitalSkillX.
    </p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#fef2f2;border-left:4px solid ${p.brandColor?.trim() || "#dc2626"};border-radius:8px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">What you get</p>
      <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#475569;">
        <li>Lifetime access to all lessons</li>
        <li>Self-paced learning on any device</li>
        <li>Quizzes, assignments, and progress tracking</li>
        <li>Certificate when you complete the course</li>
      </ul>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
      Log in at <a href="${escapeHtml(p.loginUrl)}" style="color:#b91c1c;text-decoration:underline;">${escapeHtml(p.loginUrl)}</a>
      with the email address this message was sent to. If you do not have a password yet, use
      <a href="${escapeHtml(p.loginUrl.replace(/\/login\/?$/, "/forgot-password"))}" style="color:#b91c1c;text-decoration:underline;">Forgot password</a>
      to set one, then open your course.
    </p>`;

  return {
    subject: `You're enrolled — ${p.courseTitle}`,
    html: emailLayout({
      brandColor: p.brandColor,
      title: `You're enrolled — ${p.courseTitle}`,
      bodyHtml,
      cta: { label: "Start learning", url: p.courseUrl },
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

export type ProgressMilestoneEmailParams = {
  firstName: string;
  courseTitle: string;
  milestonePct: 25 | 50 | 75;
  nextLessonTitle: string;
  resumeUrl: string;
  supportEmail: string;
  brandColor?: string;
};

const MILESTONE_HEADLINES: Record<25 | 50 | 75, string> = {
  25: "You're off to a great start!",
  50: "Halfway there — nice work!",
  75: "Almost at the finish line!",
};

export function progressMilestoneEmail(p: ProgressMilestoneEmailParams) {
  const headline = MILESTONE_HEADLINES[p.milestonePct];
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">${escapeHtml(headline)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      Hi ${escapeHtml(p.firstName)}, you&apos;ve reached <strong>${p.milestonePct}%</strong> of
      <strong>${escapeHtml(p.courseTitle)}</strong> on DigitalSkillX. Keep the momentum going!
    </p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Up next</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(p.nextLessonTitle)}</p>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
      Pick up right where you left off — we&apos;ll take you to your next lesson.
    </p>`;

  return {
    subject: `${p.milestonePct}% complete — ${p.courseTitle}`,
    html: emailLayout({
      brandColor: p.brandColor,
      title: `${p.milestonePct}% complete — ${p.courseTitle}`,
      bodyHtml,
      cta: { label: "Continue learning", url: p.resumeUrl },
      supportEmail: p.supportEmail,
    }),
  };
}

export type CheckoutAbandonReminderEmailParams = {
  firstName: string;
  courseTitle?: string | null;
  resumeUrl: string;
  supportEmail: string;
  brandColor?: string;
};

/** Soft reminder to finish checkout — no fake urgency or countdown copy. */
export function checkoutAbandonReminderEmail(p: CheckoutAbandonReminderEmailParams) {
  const productLine = p.courseTitle?.trim()
    ? `You started checkout for <strong>${escapeHtml(p.courseTitle.trim())}</strong> on DigitalSkillX.`
    : `You started checkout on DigitalSkillX.`;

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Hi ${escapeHtml(p.firstName)},</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      ${productLine} Your spot is still available whenever you are ready to continue.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
      Use the button below to pick up where you left off. If you already completed payment, you can ignore this message.
    </p>`;

  return {
    subject: p.courseTitle?.trim()
      ? `Continue your purchase — ${p.courseTitle.trim()}`
      : "Continue your DigitalSkillX purchase",
    html: emailLayout({
      brandColor: p.brandColor,
      title: "Continue your purchase",
      bodyHtml,
      cta: { label: "Resume checkout", url: p.resumeUrl },
      supportEmail: p.supportEmail,
    }),
  };
}

export { courseListHtml };

export type PaystackCourseAccessEmailParams = {
  firstName: string;
  courseTitle: string;
  courseUrl: string;
  loginUrl: string;
  isNewAccount: boolean;
  supportEmail: string;
  brandColor?: string;
};

export function paystackCourseAccessReadyEmail(p: PaystackCourseAccessEmailParams) {
  const newAccountLine = p.isNewAccount
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
        If you are new to DigitalSkillX, use the secure sign-in link we sent separately to open your account, then return here to start learning.
      </p>`
    : `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
        If you already have a DigitalSkillX account, log in using your existing account.
      </p>`;

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Hello ${escapeHtml(p.firstName)},</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      Your payment for <strong>${escapeHtml(p.courseTitle)}</strong> was successful.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      Your course access is now ready.
    </p>
    <div style="margin:0 0 20px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Course</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(p.courseTitle)}</p>
    </div>
    ${newAccountLine}
    <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
      Access your course at
      <a href="${escapeHtml(p.loginUrl)}" style="color:#b91c1c;text-decoration:underline;">${escapeHtml(p.loginUrl)}</a>
    </p>`;

  return {
    subject: "Your course access is ready",
    html: emailLayout({
      brandColor: p.brandColor,
      title: "Your course access is ready",
      bodyHtml,
      cta: { label: "Start learning", url: p.courseUrl },
      supportEmail: p.supportEmail,
    }),
  };
}

