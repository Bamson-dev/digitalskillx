import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  getYoutubeApiKey,
  youtubeApiKeyConfigured,
  youtubeApiKeyDiagnostics,
  youtubeApiKeyError,
} from "@/lib/env-youtube";
import {
  fetchLessonsForImport,
  resolveImportModuleTitle,
  type LessonImportSource,
} from "@/lib/lesson-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SOURCES = new Set<LessonImportSource>([
  "youtube_playlist",
  "youtube_video",
  "vimeo",
  "wistia",
  "loom",
]);

/** Admin diagnostic: is YouTube API key configured? */
export async function GET() {
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const youtube = await youtubeApiKeyDiagnostics(auth.session);
  return NextResponse.json({
    youtubeApiKeyConfigured: youtube.status === "ok",
    youtubeApiKeyStatus: youtube.status,
    youtubeApiKeySource: youtube.source,
  });
}

/**
 * Imports video lessons from YouTube, Vimeo, Wistia, or Loom. Admin-only.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-lesson-import", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const supabase = auth.admin;
  const body = (await request.json()) as {
    courseId?: string;
    url?: string;
    moduleId?: string;
    source?: LessonImportSource;
    preview?: boolean;
    videoIds?: string[];
  };

  if (!body.courseId || !body.url) {
    return NextResponse.json({ error: "courseId and url are required" }, { status: 400 });
  }

  const source = body.source ?? "youtube_playlist";
  if (!VALID_SOURCES.has(source)) {
    return NextResponse.json({ error: "Invalid import source." }, { status: 400 });
  }

  if (source.startsWith("youtube_") && !(await youtubeApiKeyConfigured(auth.session))) {
    return NextResponse.json({ error: await youtubeApiKeyError(auth.session) }, { status: 503 });
  }

  let youtubeApiKey: string | undefined;
  if (source.startsWith("youtube_")) {
    youtubeApiKey = await getYoutubeApiKey(auth.session);
  }

  let importResult;
  try {
    importResult = await fetchLessonsForImport(source, body.url, { youtubeApiKey });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 400 },
    );
  }

  const { lessons, skipped: skippedAtFetch } = importResult;

  if (lessons.length === 0) {
    return NextResponse.json(
      {
        error: "No lessons found to import.",
        skipped: skippedAtFetch,
        skipReasons: skippedAtFetch,
      },
      { status: 404 },
    );
  }

  if (body.preview) {
    return NextResponse.json({
      preview: true,
      videos: lessons.map((lesson) => ({
        youtubeVideoId: lesson.youtubeVideoId,
        title: lesson.title,
        durationSeconds: lesson.durationSeconds,
        contentUrl: lesson.contentUrl,
      })),
      total: lessons.length,
      skipped: skippedAtFetch.length,
      skipReasons: skippedAtFetch,
    });
  }

  const selectedIds = body.videoIds?.filter(Boolean);
  const lessonsToImport =
    selectedIds && selectedIds.length > 0
      ? lessons.filter((lesson) =>
          lesson.youtubeVideoId
            ? selectedIds.includes(lesson.youtubeVideoId)
            : selectedIds.includes(lesson.dedupeKey),
        )
      : lessons;

  if (lessonsToImport.length === 0) {
    return NextResponse.json({ error: "No videos selected for import." }, { status: 400 });
  }

  let moduleId = body.moduleId;
  if (!moduleId) {
    const moduleTitle = await resolveImportModuleTitle(source, body.url, lessons, {
      youtubeApiKey,
    });
    const { count } = await supabase
      .from("modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", body.courseId);
    const { data: mod } = await supabase
      .from("modules")
      .insert({
        course_id: body.courseId,
        title: moduleTitle,
        position: count ?? 0,
      })
      .select("id")
      .single();
    moduleId = mod?.id;
  }
  if (!moduleId) return NextResponse.json({ error: "Could not resolve module" }, { status: 500 });

  const { data: existingLessons } = await supabase
    .from("lessons")
    .select("youtube_video_id, content_url, module:modules!inner(course_id)")
    .eq("module.course_id", body.courseId);

  const existingYoutube = new Set(
    (existingLessons ?? []).map((l) => l.youtube_video_id).filter(Boolean) as string[],
  );
  const existingUrls = new Set(
    (existingLessons ?? []).map((l) => l.content_url).filter(Boolean) as string[],
  );

  const { count: startPos } = await supabase
    .from("lessons")
    .select("*", { count: "exact", head: true })
    .eq("module_id", moduleId);

  let imported = 0;
  let skipped = skippedAtFetch.length;
  const skipReasons = [...skippedAtFetch];
  let pos = startPos ?? 0;
  const importedLessons: {
    id: string;
    title: string;
    youtubeVideoId: string | null;
    moduleId: string;
  }[] = [];

  for (const lesson of lessonsToImport) {
    const isDupe = lesson.youtubeVideoId
      ? existingYoutube.has(lesson.youtubeVideoId)
      : existingUrls.has(lesson.contentUrl);

    if (isDupe) {
      skipped++;
      skipReasons.push({
        videoId: lesson.youtubeVideoId,
        title: lesson.title,
        reason: "Already imported in this course",
      });
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("lessons")
      .insert({
        module_id: moduleId,
        title: lesson.title,
        description: lesson.description,
        lesson_type: "video",
        content_url: lesson.contentUrl,
        youtube_video_id: lesson.youtubeVideoId,
        duration_seconds: lesson.durationSeconds,
        position: pos++,
      })
      .select("id, title, youtube_video_id")
      .single();

    if (!error && inserted) {
      imported++;
      importedLessons.push({
        id: inserted.id,
        title: inserted.title,
        youtubeVideoId: inserted.youtube_video_id,
        moduleId,
      });
      if (lesson.youtubeVideoId) existingYoutube.add(lesson.youtubeVideoId);
      else existingUrls.add(lesson.contentUrl);
    }
  }

  await logAudit({
    action: "lesson_imported",
    targetType: "course",
    targetId: body.courseId,
    metadata: { source, imported, skipped, total: lessonsToImport.length },
  });

  return NextResponse.json({
    imported,
    skipped,
    total: lessonsToImport.length,
    moduleId,
    lessons: importedLessons,
    skipReasons,
  });
}
