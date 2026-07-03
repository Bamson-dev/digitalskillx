/** Admin email from env, with production default when unset on Vercel. */
export function configuredAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "admin@digitalskillx.com";
}

/** Emails allowed to sign in at /admin/login. */
export function isPlatformAdminEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized === "admin@digitalskillx.com") return true;
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return configured ? normalized === configured : normalized === configuredAdminEmail();
}
