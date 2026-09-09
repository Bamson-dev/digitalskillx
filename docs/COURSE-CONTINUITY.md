# Course continuity (keep learning during outages)

Students should not lose classroom access when Auth, DNS, or Postgres briefly fails.

## What ships

1. **Signed continuity cookie** (`dsx_course_continuity`) — refreshed silently after a successful course/lesson load via `POST /api/course-continuity/refresh`.
2. **Soft Auth gate** — middleware and `requireStudent()` accept the continuity cookie (or an existing session cookie during Auth timeouts) for classroom routes instead of bouncing everyone to `/login`.
3. **Device curriculum cache** — IndexedDB snapshot of modules/lessons/video URLs, written by `CourseContinuityBeacon` (no UI change).
4. **`/continue`** — public continuity player that plays the last saved copy on this browser when the live classroom is unavailable.
5. **Service worker v3** — caches recently visited `/courses/*` and `/lessons/*` navigations; falls back to `/continue` when the network fails.
6. **Dockerfile HEALTHCHECK** — probes instant `/api/health` only (never Supabase), so Coolify/Traefik do not mark the app dead during Auth/DB blips.

## Limits (honest)

- Absolute “never down” needs multi-region hardware. This stack keeps **already-opened** courses reachable on the same device during Auth/DNS/app blips.
- Video still needs YouTube/Wistia reachability.
- First-time open of a course still needs a healthy Auth+DB path once, so the beacon can stamp the cookie + IndexedDB.

## Ops

- Optional env: `COURSE_CONTINUITY_SECRET` (falls back to `CRON_SECRET` / service role).
- Coolify healthcheck must stay on public `/api/health`.
- Prefer rolling/redeploy only after health is green; avoid long “unhealthy” probes that hit Supabase.
