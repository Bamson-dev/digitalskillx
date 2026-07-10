-- Per-lesson coming soon state with optional expected availability date.

alter table public.lessons
  add column if not exists is_coming_soon boolean not null default false,
  add column if not exists coming_soon_available_at timestamptz;

create index if not exists lessons_coming_soon_idx
  on public.lessons (is_coming_soon)
  where is_coming_soon = true;

comment on column public.lessons.is_coming_soon is
  'When true, students see the lesson title but content shows a Coming Soon state.';

comment on column public.lessons.coming_soon_available_at is
  'Optional date shown to students for when lesson content is expected.';
