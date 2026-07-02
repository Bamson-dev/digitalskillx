-- DeepSeek API key in platform_secrets (same pattern as YouTube — survives Coolify env issues).

alter table public.platform_secrets
  add column if not exists deepseek_api_key text;
