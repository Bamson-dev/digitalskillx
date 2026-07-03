-- ZeptoMail SMTP password in platform_secrets (fallback when Coolify env does not reach Next.js).

alter table public.platform_secrets
  add column if not exists zeptomail_smtp_password text;
