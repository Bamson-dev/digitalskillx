-- Run in Supabase SQL Editor if Enroll Now fails with payment errors.

drop policy if exists "transactions: insert own pending checkout" on public.transactions;
create policy "transactions: insert own pending checkout" on public.transactions
  for insert with check (
    student_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.courses c
      where c.id = course_id
        and c.visibility = 'published'
        and c.enrollment_type = 'open'
    )
  );
