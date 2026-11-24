-- Seven-email recovery sequence: allow the new message step names.
-- Idempotent. Keeps the legacy 'final_48h' value so old rows stay valid.
alter table public.payment_recovery_messages
  drop constraint if exists payment_recovery_messages_step_check;
alter table public.payment_recovery_messages
  add constraint payment_recovery_messages_step_check
  check (step in (
    'initial','followup_3h','help_12h','reminder_24h','reminder_48h',
    'reminder_72h','final_120h','final_48h','manual'
  ));
