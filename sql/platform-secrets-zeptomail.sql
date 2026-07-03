-- ZeptoMail SMTP password in platform_secrets (survives Coolify env propagation issues).

alter table public.platform_secrets
  add column if not exists zeptomail_smtp_password text;

-- Optional: paste your key directly in SQL if Coolify env does not reach Next.js:
-- update public.platform_secrets
-- set zeptomail_smtp_password = 'your-zeptomail-smtp-password'
-- where id = 'default';
