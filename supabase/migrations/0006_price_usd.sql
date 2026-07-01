-- Dual pricing: fixed USD price alongside Naira (staging).

alter table public.courses
  add column if not exists price_usd integer not null default 0 check (price_usd >= 0);
