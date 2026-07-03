/** Admin email from env, with production default when unset on Vercel. */
export function configuredAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "admin@digitalskillx.com";
}
