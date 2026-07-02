-- Paystack secret in platform_secrets (survives Coolify env propagation issues).

alter table public.platform_secrets
  add column if not exists paystack_secret_key text;
