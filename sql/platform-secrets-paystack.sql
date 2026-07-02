-- Paystack secret in platform_secrets (same pattern as YouTube / DeepSeek).

alter table public.platform_secrets
  add column if not exists paystack_secret_key text;

-- Optional: paste your key directly in SQL if Coolify env does not reach Next.js:
-- update public.platform_secrets
-- set paystack_secret_key = 'sk_live_xxxxxxxx'
-- where id = 'default';
