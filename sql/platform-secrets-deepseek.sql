-- Add DeepSeek key column (run once in Supabase SQL Editor if AI copy says key missing).

alter table public.platform_secrets
  add column if not exists deepseek_api_key text;

-- Fastest fix: paste your DeepSeek key here
-- update public.platform_secrets
-- set deepseek_api_key = 'sk-YOUR_KEY_HERE'
-- where id = 'default';
