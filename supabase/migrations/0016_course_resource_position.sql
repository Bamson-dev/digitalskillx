-- Course-level resource ordering (lesson_id IS NULL).

alter table public.resources
  add column if not exists position integer not null default 0;

create index if not exists resources_course_level_idx
  on public.resources (course_id, position)
  where lesson_id is null;

-- Backfill existing course-level rows by created_at order.
with ordered as (
  select
    id,
    row_number() over (
      partition by course_id
      order by created_at asc
    ) - 1 as new_position
  from public.resources
  where lesson_id is null
)
update public.resources r
set position = ordered.new_position
from ordered
where r.id = ordered.id;
