const DEFAULT_BRAND = "#dc2626";
const PLATFORM = "DigitalSkillX";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type StudentWelcomeEmailParams = {
  firstName: string;
  email: string;
  password: string;
  courseNames: string[];
  loginUrl: string;
  settingsUrl: string;
  supportEmail: string;
  brandColor?: string;
};

/** Welcome email for admin-created students (single or bulk). */
export function studentWelcomeEmail(p: StudentWelcomeEmailParams) {
  const brand = p.brandColor?.trim() || DEFAULT_BRAND;
  const courses = p.courseNames.length > 0 ? p.courseNames : ["Your assigned courses"];
  const courseLabel =
    courses.length === 1 ? "Your course" : `Your courses (${courses.length})`;

  const courseListHtml = courses
    .map(
      (name) =>
        `<li style="margin:0 0 10px;padding:12px 14px;background:#fef2f2;border-left:4px solid ${brand};border-radius:8px;font-size:15px;font-weight:700;color:#111827;">${escapeHtml(name)}</li>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome to ${PLATFORM}</title>
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
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#111827;">Welcome, ${escapeHtml(p.firstName)}!</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">
                Your DigitalSkillX learning account is ready. We&apos;re glad to have you on board.
              </p>

              <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">${courseLabel}</p>
              <ul style="margin:0 0 24px;padding:0;list-style:none;">${courseListHtml}</ul>

              <div style="margin:0 0 24px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#111827;">What you get with each course</p>
                <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#475569;">
                  <li>Lifetime access</li>
                  <li>Self-paced lessons you can take anytime</li>
                  <li>Quizzes and assignments to practice</li>
                  <li>Progress tracking across every module</li>
                  <li>A verified certificate when you complete the course</li>
                </ul>
              </div>

              <div style="margin:0 0 24px;padding:18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
                <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#9a3412;">Your login details</p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#334155;"><strong>Email:</strong> ${escapeHtml(p.email)}</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;"><strong>Password:</strong> <code style="font-size:15px;font-weight:700;color:#111827;background:#fff;padding:4px 8px;border-radius:6px;border:1px solid #e2e8f0;">${escapeHtml(p.password)}</code></p>
              </div>

              <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#475569;">
                For your security, please log in and change your password on first use.
                Open <a href="${escapeHtml(p.settingsUrl)}" style="color:${brand};font-weight:600;">Account &amp; privacy settings</a>
                after signing in, or use <strong>Forgot password</strong> on the login page if you need to reset it.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
                <tr>
                  <td style="border-radius:10px;background:${brand};">
                    <a href="${escapeHtml(p.loginUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Log in to DigitalSkillX</a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                Login URL: <a href="${escapeHtml(p.loginUrl)}" style="color:${brand};">${escapeHtml(p.loginUrl)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 8px;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
              Questions? Reply to this email or contact us at
              <a href="mailto:${escapeHtml(p.supportEmail)}" style="color:${brand};">${escapeHtml(p.supportEmail)}</a>.
              <br /><br />
              ${PLATFORM} by Pdigital MarketStore Ltd · RC 8015428 · Lagos, Nigeria
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject:
      courses.length === 1
        ? `Welcome to DigitalSkillX — ${courses[0]}`
        : `Welcome to DigitalSkillX — your courses are ready`,
    html,
  };
}
