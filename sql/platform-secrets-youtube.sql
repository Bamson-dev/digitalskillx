-- Run in Supabase SQL Editor (staging). Safe to re-run.
-- Stores YouTube API key in DB so Coolify/Next.js env issues don't block lesson import.

create table if not exists public.platform_secrets (
  id              text primary key default 'default' check (id = 'default'),
  youtube_api_key text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'platform_secrets_set_updated_at'
  ) then
    create trigger platform_secrets_set_updated_at
      before update on public.platform_secrets
      for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.platform_secrets (id)
values ('default')
on conflict (id) do nothing;

alter table public.platform_secrets enable row level security;

drop policy if exists "platform_secrets: admin all" on public.platform_secrets;
create policy "platform_secrets: admin all" on public.platform_secrets
  for all using (public.is_admin()) with check (public.is_admin());

-- Optional: paste your YouTube key here (fastest fix — no Admin Settings UI needed)
-- insert into public.platform_secrets (id, youtube_api_key)
-- values ('default', 'AIzaSyYOUR_KEY_HERE')
-- on conflict (id) do update set youtube_api_key = excluded.youtube_api_key;
