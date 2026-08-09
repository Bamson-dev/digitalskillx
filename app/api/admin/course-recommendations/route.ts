import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import {
  deleteCourseRecommendation,
  listCourseRecommendations,
  upsertCourseRecommendation,
  type RecommendationKind,
} from "@/lib/course-recommendations";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  const courseId = request.nextUrl.searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "courseId required" }, { status: 400 });
  }
  const rows = await listCourseRecommendations(auth.admin, courseId);
  return NextResponse.json({ recommendations: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  let body: {
    courseId?: string;
    recommendedCourseId?: string;
    kind?: RecommendationKind;
    sortOrder?: number;
    active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.courseId || !body.recommendedCourseId) {
    return NextResponse.json({ error: "courseId and recommendedCourseId required" }, { status: 400 });
  }
  try {
    const row = await upsertCourseRecommendation(auth.admin, {
      courseId: body.courseId,
      recommendedCourseId: body.recommendedCourseId,
      kind: body.kind ?? "cross_sell",
      sortOrder: body.sortOrder,
      active: body.active,
    });
    return NextResponse.json({ recommendation: row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteCourseRecommendation(auth.admin, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
