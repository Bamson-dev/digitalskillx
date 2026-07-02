import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  getYoutubeApiKey,
  youtubeApiKeyConfigured,
  youtubeApiKeyDiagnostics,
  youtubeApiKeyError,
} from "@/lib/env-youtube";
import {
  defaultModuleTitle,
  fetchLessonsForImport,
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

async function requireAdminApi() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" || profile?.is_suspended) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, supabase };
}

/** Admin diagnostic: is YouTube API key configured? */
export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth && auth.error) return auth.error;

  const youtube = await youtubeApiKeyDiagnostics(auth.supabase);
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

  const auth = await requireAdminApi();
  if ("error" in auth && auth.error) return auth.error;

  const supabase = auth.supabase;
  const body = (await request.json()) as {
    courseId?: string;
    url?: string;
    moduleId?: string;
    source?: LessonImportSource;
  };

  if (!body.courseId || !body.url) {
    return NextResponse.json({ error: "courseId and url are required" }, { status: 400 });
  }

  const source = body.source ?? "youtube_playlist";
  if (!VALID_SOURCES.has(source)) {
    return NextResponse.json({ error: "Invalid import source." }, { status: 400 });
  }

  if (source.startsWith("youtube_") && !(await youtubeApiKeyConfigured(supabase))) {
    return NextResponse.json({ error: await youtubeApiKeyError(supabase) }, { status: 503 });
  }

  let youtubeApiKey: string | undefined;
  if (source.startsWith("youtube_")) {
    youtubeApiKey = await getYoutubeApiKey(supabase);
  }

  let lessons;
  try {
    lessons = await fetchLessonsForImport(source, body.url, { youtubeApiKey });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 400 },
    );
  }

  if (lessons.length === 0) {
    return NextResponse.json({ error: "No lessons found to import." }, { status: 404 });
  }

  let moduleId = body.moduleId;
  if (!moduleId) {
    const { count } = await supabase
      .from("modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", body.courseId);
    const { data: mod } = await supabase
      .from("modules")
      .insert({
        course_id: body.courseId,
        title: defaultModuleTitle(source),
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
  let skipped = 0;
  let pos = startPos ?? 0;

  for (const lesson of lessons) {
    const isDupe = lesson.youtubeVideoId
      ? existingYoutube.has(lesson.youtubeVideoId)
      : existingUrls.has(lesson.contentUrl);

    if (isDupe) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("lessons").insert({
      module_id: moduleId,
      title: lesson.title,
      description: lesson.description,
      lesson_type: "video",
      content_url: lesson.contentUrl,
      youtube_video_id: lesson.youtubeVideoId,
      duration_seconds: lesson.durationSeconds,
      position: pos++,
    });

    if (!error) {
      imported++;
      if (lesson.youtubeVideoId) existingYoutube.add(lesson.youtubeVideoId);
      else existingUrls.add(lesson.contentUrl);
    }
  }

  await logAudit({
    action: "lesson_imported",
    targetType: "course",
    targetId: body.courseId,
    metadata: { source, imported, skipped, total: lessons.length },
  });

  return NextResponse.json({ imported, skipped, total: lessons.length });
}
