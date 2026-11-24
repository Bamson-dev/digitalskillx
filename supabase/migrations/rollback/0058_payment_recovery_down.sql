-- Reverses 0058_payment_recovery.sql. Drops only the recovery tables.
-- public.transactions and every payment record stay untouched.
drop table if exists public.payment_recovery_webhook_events;
drop table if exists public.payment_recovery_suppressions;
drop table if exists public.payment_recovery_bank_confirmations;
drop table if exists public.payment_recovery_events;
drop table if exists public.payment_recovery_messages;
drop table if exists public.payment_recovery_attempts;
drop table if exists public.payment_recovery_groups;
