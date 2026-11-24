import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The signed-in student's most recent enrolments, with course cards. */
export async function GET() {
  const db = createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ courses: [] });

  const { data, error } = await db
    .from("enrollments")
    .select("course_id, courses(id, title, thumbnail_url)")
    .eq("student_id", user.id)
    .order("enrolled_at", { ascending: false })
    .limit(12);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const courses: any[] = [];
  for (const row of data ?? []) {
    const c = row.courses as unknown;
    const course = Array.isArray(c) ? c[0] : c;
    if (course && (course as { id?: string }).id) courses.push(course);
  }
  return NextResponse.json({ courses });
}
