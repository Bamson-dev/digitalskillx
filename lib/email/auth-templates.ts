import { emailLayout, escapeHtml } from "@/lib/email/layout";

export type AuthEmailParams = {
  firstName: string;
  actionUrl: string;
  brandColor?: string;
  supportEmail: string;
};

export function passwordResetEmail(p: AuthEmailParams) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Reset your password</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      Hi ${escapeHtml(p.firstName)}, we received a request to reset your DigitalSkillX password.
      Click the button below to choose a new password. This link expires soon for your security.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">
      If you did not request this, you can safely ignore this email.
    </p>`;

  return {
    subject: "Reset your DigitalSkillX password",
    html: emailLayout({
      title: "Reset your password",
      brandColor: p.brandColor,
      bodyHtml,
      cta: { label: "Reset password", url: p.actionUrl },
      supportEmail: p.supportEmail,
    }),
  };
}

export function magicLinkEmail(p: AuthEmailParams) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Sign in to DigitalSkillX</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">
      Hi ${escapeHtml(p.firstName)}, use the button below to sign in without a password.
      This link expires soon and can only be used once.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">
      If you did not request this, you can safely ignore this email.
    </p>`;

  return {
    subject: "Sign in to DigitalSkillX",
    html: emailLayout({
      title: "Sign in to DigitalSkillX",
      brandColor: p.brandColor,
      bodyHtml,
      cta: { label: "Sign in", url: p.actionUrl },
      supportEmail: p.supportEmail,
    }),
  };
}
