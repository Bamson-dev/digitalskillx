import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  COURSE_CONTINUITY_COOKIE,
  COURSE_CONTINUITY_MAX_AGE_SEC,
  continuityCookieOptions,
  createContinuityToken,
  readContinuityPayload,
} from "@/lib/course-continuity/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  courseIds?: string[];
};

/**
 * Refreshes the httpOnly continuity cookie after a successful classroom load.
 * Students keep access through Auth blips without changing the UI.
 */
export async function POST(request: NextRequest) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const requestedCourses = Array.isArray(body.courseIds)
    ? body.courseIds.filter((id) => typeof id === "string" && id.length > 0).slice(0, 40)
    : [];

  const existing = await readContinuityPayload(
    request.cookies.get(COURSE_CONTINUITY_COOKIE)?.value,
  );

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, role, is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_suspended) {
      const res = NextResponse.json({ ok: false, error: "suspended" }, { status: 403 });
      res.cookies.set(COURSE_CONTINUITY_COOKIE, "", { ...continuityCookieOptions(0), maxAge: 0 });
      return res;
    }

    const role = profile?.role === "admin" ? "admin" : "student";
    let courseIds = requestedCourses;

    if (courseIds.length === 0) {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", user.id)
        .limit(40);
      courseIds = (enrollments ?? []).map((row) => row.course_id).filter(Boolean);
    }

    if (existing?.sub === user.id) {
      courseIds = Array.from(new Set([...existing.courses, ...courseIds]));
    }

    const token = await createContinuityToken({
      sub: user.id,
      email: (profile?.email || user.email || "").toLowerCase(),
      name: profile?.full_name || user.email || "Student",
      role,
      courses: courseIds,
    });

    const res = NextResponse.json({
      ok: true,
      courses: courseIds.length,
      expiresInSec: COURSE_CONTINUITY_MAX_AGE_SEC,
    });
    res.cookies.set(COURSE_CONTINUITY_COOKIE, token, continuityCookieOptions());
    return res;
  }

  // Auth briefly unavailable — extend an already-valid continuity cookie.
  if (existing) {
    const token = await createContinuityToken({
      sub: existing.sub,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      courses: Array.from(new Set([...existing.courses, ...requestedCourses])),
    });
    const res = NextResponse.json({
      ok: true,
      degraded: true,
      courses: existing.courses.length,
      expiresInSec: COURSE_CONTINUITY_MAX_AGE_SEC,
    });
    res.cookies.set(COURSE_CONTINUITY_COOKIE, token, continuityCookieOptions());
    return res;
  }

  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
