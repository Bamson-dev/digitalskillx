import { NextRequest } from "next/server";
import { detectYoutubeInput } from "@/lib/youtube";
import { POST as lessonImport } from "@/app/api/admin/lesson-import/route";

/** Legacy endpoint — forwards to lesson-import with auto-detected YouTube source. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    courseId?: string;
    url?: string;
    moduleId?: string;
    source?: string;
  };

  if (!body.source && body.url) {
    const input = detectYoutubeInput(body.url);
    if (input?.type === "playlist") body.source = "youtube_playlist";
    else if (input?.type === "video") body.source = "youtube_video";
  }

  return lessonImport(
    new NextRequest(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
    }),
  );
}
