-- DigitalSkillX marketplace: course pricing, purchases, transactions (staging).

alter type enrollment_source add value if not exists 'purchase';

alter table public.courses
  add column if not exists price_ngn integer not null default 0 check (price_ngn >= 0),
  add column if not exists short_description text,
  add column if not exists learning_outcomes text[] not null default '{}',
  add column if not exists instructor_name text,
  add column if not exists instructor_bio text,
  add column if not exists promo_video_url text;

create type transaction_status as enum ('pending', 'success', 'failed');
create type payment_provider as enum ('paystack');

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  amount       integer not null check (amount > 0),
  currency     text not null default 'NGN',
  provider     payment_provider not null default 'paystack',
  reference    text not null unique,
  status       transaction_status not null default 'pending',
  paystack_data jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists transactions_student_idx on public.transactions (student_id);
create index if not exists transactions_course_idx on public.transactions (course_id);
create index if not exists transactions_reference_idx on public.transactions (reference);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

create policy "transactions: read own" on public.transactions
  for select using (student_id = auth.uid());

create policy "transactions: admin all" on public.transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- Published course outline (titles only) visible for marketing pages.
create policy "modules: read published course" on public.modules
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and c.visibility = 'published'
    )
  );

create policy "lessons: read published outline" on public.lessons
  for select using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_id and c.visibility = 'published'
    )
  );
