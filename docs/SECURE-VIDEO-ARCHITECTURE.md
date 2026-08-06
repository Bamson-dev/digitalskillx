# Secure Video Architecture (future)

**Status:** Designed — **no production migration**  
**Live playback today:** `lib/video.ts` → `resolveVideo()` → `components/student/lesson-player.tsx` (YouTube / Vimeo / Wistia / Loom / file)

## Goals

- Host lessons on Cloudflare Stream, Bunny Stream, Mux, or signed Vimeo without rewriting the player each time.
- Support **signed temporary URLs**.
- Keep YouTube working indefinitely for existing courses.

## Abstraction

`lib/video-provider.ts` defines:

| Type | Role |
|------|------|
| `VideoProvider` | Interface: `resolve()` + optional `signPlayback()` |
| `ResolvedPlayback` | Provider-agnostic `{ kind, url, expiresInSeconds, assetId }` |
| `registerVideoProvider` | Swap providers via config |
| `legacyEmbedToPlayback` | Bridge from today’s `resolveVideo()` |

LessonPlayer should eventually consume **only** `ResolvedPlayback`.

## Suggested lesson columns (future migration)

Do **not** apply yet:

- `video_provider` text/enum
- `video_asset_id` text
- keep `content_url` / `youtube_video_id` for legacy

## Signed URL flow

1. Student opens lesson → server resolves provider + asset.
2. Provider signs URL (TTL 1–6h) with viewer id for audit.
3. Player loads iframe/HLS/mp4 from `ResolvedPlayback.url`.
4. On expiry, soft-refresh via API (no full page reload).

## Analytics prep

`lib/course-analytics.ts` documents `VideoAnalyticsEvent` for future watch-time ingest. Current course analytics use enrollments + `lesson_progress` only.

## Rollout plan

1. Implement one provider adapter behind a feature flag.
2. Pilot on a single unpublished course.
3. Keep YouTube path for all other courses.
4. Migrate course-by-course — never a big-bang cutover.
