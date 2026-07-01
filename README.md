# DigitalSkillX

**Where Profitable Digital Skills Are Sold**

Self-paced course delivery platform by **Pdigital MarketStore Ltd** — structured
learning, automatic progress tracking, and verifiable certificates.

> Production domain: **digitalskillx.com** · Student portal & certificate verification at `/verify/[number]`

## Tech stack

| Layer        | Choice                                            |
| ------------ | ------------------------------------------------- |
| Frontend     | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend / DB | Supabase (Postgres, Auth, Storage, Edge Functions)|
| Hosting      | Vercel                                            |
| Email        | ZeptoMail (SMTP via Nodemailer)                   |
| AI assistant | Claude API                                        |

## Project status — Phases 1–6 ✅

**Phase 1 — Foundation**
- Route groups `(auth)`, `(student)`, `(admin)`; full Supabase schema (24 tables, enums, triggers)
- RLS on every table + `is_admin` / `is_enrolled` helpers; storage buckets with policies
- Student auth (email/password, magic link, reset) + admin login with role guard
- Session-refresh + route-protection middleware

**Phase 2 — Course delivery**
- Admin course builder: courses, modules, lessons CRUD, settings, drip + sequential locking
- Student management: create, suspend, delete, reset password, tags, internal notes, CSV bulk import
- Manual enrollment / un-enrollment with email + in-app notification
- Course player for every lesson type (video/PDF/text/audio/slides/embed/download), watermark,
  speed/PiP/fullscreen, progress + mark-complete, curriculum outline, notes, bookmarks

**Phase 3 — Assessment**
- Quiz builder (MCQ single/multi, true/false, short answer, essay, file upload), settings, retakes
- Quiz taking with timer + randomization, auto-grading, manual grading queue
- Assignments (text/link/file submission) + admin grading/feedback; resource library with signed URLs

**Phase 4 — Certificates & comms**
- Auto-issued certificates on completion, printable certificate view, QR + public `/verify/[number]`
- LinkedIn "add to profile"; ZeptoMail transactional emails; in-app notification center (bell)

**Phase 5 — Growth tooling**
- YouTube import (video / playlist / channel) via Data API v3 with dedupe
- Bulk email + in-app announcements (all students or per-course)
- Automation engine + rule builder (triggers → email / notify / enroll / certificate / tag)
- Daily inactivity cron job (Vercel Cron)

**Phase 6 — Intelligence & PWA**
- Analytics dashboard (Recharts): sign-ups, enrollment/completion, completion rate, certificates
- AI Learning Assistant (Claude API) floating widget with lesson grounding
- PWA: manifest, installable, offline-capable service worker (push-ready)

### Environment

Configure the keys in `.env.example`. Copy to `.env.local` and run `npm run check-env` to
validate. Set `NEXT_PUBLIC_SITE_URL=https://digitalskillx.com` in production. `SUPABASE_SERVICE_ROLE_KEY` is required for admin actions, emails, automations and
certificate issuance. Optional integrations: ZeptoMail SMTP vars (email), `YOUTUBE_API_KEY` (import),
`DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY` (AI), `CRON_SECRET` (scheduled jobs). Features degrade gracefully when a key
is absent.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in your Supabase URL + anon key (and service-role key for admin actions).

### 3. Set up the database

Run the migrations in `supabase/migrations` (in order) against your Supabase
project — via the Supabase SQL editor, or the CLI:

```bash
supabase db push          # or run each file in supabase/migrations/*.sql
psql "$DATABASE_URL" -f supabase/seed.sql   # optional seed data
```

Then promote your admin account:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

### 4. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command             | Description                       |
| ------------------- | --------------------------------- |
| `npm run dev`       | Start the dev server              |
| `npm run build`     | Production build                  |
| `npm run start`     | Run the production build          |
| `npm run lint`      | ESLint                            |
| `npm run typecheck` | TypeScript type check (no emit)   |
| `npm run check-env` | Validate `.env.local` variables   |

## Folder structure

```
app/
  (auth)/        login, register, forgot-password, reset-password + actions
  (student)/     dashboard, courses, courses/[id], certificates
  (admin)/admin/ login + (panel): dashboard, students, courses, analytics, settings
  auth/callback/ OAuth / magic-link / reset code exchange
  verify/        public certificate verification
components/       ui primitives + auth / admin / student components
lib/             supabase clients (client/server/admin/middleware), auth guards, utils
types/           hand-authored Supabase Database types
supabase/        migrations + seed
```

## Security notes

- RLS is the source of truth: students can only read/write their own rows.
- Admin routes are guarded server-side (`requireAdmin`) in addition to RLS.
- The service-role key is server-only (`lib/supabase/admin.ts`) — never shipped to the client.
- Private files are served via short-lived signed URLs.

---

DigitalSkillX by Pdigital MarketStore Ltd · RC 8015428 · Lagos, Nigeria
