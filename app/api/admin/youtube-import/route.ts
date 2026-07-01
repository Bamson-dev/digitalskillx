import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  detectYoutubeInput,
  fetchVideosForInput,
} from "@/lib/youtube";

/**
 * Imports YouTube videos as lessons (PRD §7). Admin-only. Creates a module if
 * none is supplied, skips videos already imported (dedupe on youtube_video_id).
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-youtube-import", 30);
  if (limited) return limited;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" || profile?.is_suspended) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { courseId?: string; url?: string; moduleId?: string };
  if (!body.courseId || !body.url) {
    return NextResponse.json({ error: "courseId and url are required" }, { status: 400 });
  }

  const input = detectYoutubeInput(body.url);
  if (!input) return NextResponse.json({ error: "Could not parse YouTube URL" }, { status: 400 });

  let videos;
  try {
    videos = await fetchVideosForInput(input);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "YouTube fetch failed" },
      { status: 500 },
    );
  }
  if (videos.length === 0) return NextResponse.json({ error: "No videos found" }, { status: 404 });

  // Resolve target module (create one if needed).
  let moduleId = body.moduleId;
  if (!moduleId) {
    const { count } = await supabase
      .from("modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", body.courseId);
    const { data: mod } = await supabase
      .from("modules")
      .insert({ course_id: body.courseId, title: "Imported from YouTube", position: count ?? 0 })
      .select("id")
      .single();
    moduleId = mod?.id;
  }
  if (!moduleId) return NextResponse.json({ error: "Could not resolve module" }, { status: 500 });

  // Dedupe against existing youtube ids in this course.
  const { data: existingLessons } = await supabase
    .from("lessons")
    .select("youtube_video_id, module:modules!inner(course_id)")
    .eq("module.course_id", body.courseId);
  const existing = new Set(
    (existingLessons ?? []).map((l) => l.youtube_video_id).filter(Boolean) as string[],
  );

  const { count: startPos } = await supabase
    .from("lessons")
    .select("*", { count: "exact", head: true })
    .eq("module_id", moduleId);

  let imported = 0;
  let skipped = 0;
  let pos = startPos ?? 0;

  for (const v of videos) {
    if (existing.has(v.videoId)) {
      skipped++;
      continue;
    }
    const { error } = await supabase.from("lessons").insert({
      module_id: moduleId,
      title: v.title,
      description: v.description.slice(0, 5000),
      lesson_type: "video",
      content_url: `https://www.youtube.com/watch?v=${v.videoId}`,
      youtube_video_id: v.videoId,
      duration_seconds: v.durationSeconds,
      position: pos++,
    });
    if (!error) imported++;
  }

  await logAudit({
    action: "youtube_imported",
    targetType: "course",
    targetId: body.courseId,
    metadata: { imported, skipped, total: videos.length },
  });

  return NextResponse.json({ imported, skipped, total: videos.length });
}
