import { NextResponse, type NextRequest } from "next/server";
import { exportStudentData, requireStudentApi } from "@/lib/student-data";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "student-export", 20);
  if (limited) return limited;

  const profile = await requireStudentApi();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await exportStudentData(profile.id);
  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="digitalskillx-data-${profile.id}.json"`,
    },
  });
}
