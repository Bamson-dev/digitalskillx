import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteStudentAccount, requireStudentApi } from "@/lib/student-data";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "student-delete", 5);
  if (limited) return limited;

  const profile = await requireStudentApi();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { confirm?: string };
  if (body.confirm !== "DELETE") {
    return NextResponse.json({ error: 'Send { "confirm": "DELETE" } to proceed.' }, { status: 400 });
  }

  try {
    await deleteStudentAccount(profile.id);
    const supabase = createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deletion failed" },
      { status: 500 },
    );
  }
}
