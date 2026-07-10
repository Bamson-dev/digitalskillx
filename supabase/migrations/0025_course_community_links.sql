-- Optional community links (Telegram, WhatsApp) shown to enrolled students.

alter table public.courses
  add column if not exists community_telegram_url text,
  add column if not exists community_whatsapp_url text;

comment on column public.courses.community_telegram_url is
  'Telegram group or channel invite link for enrolled students.';

comment on column public.courses.community_whatsapp_url is
  'WhatsApp community or group invite link for enrolled students.';
