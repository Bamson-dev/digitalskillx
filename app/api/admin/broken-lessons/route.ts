import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { fetchBrokenLessonsReport } from "@/lib/broken-lessons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Admin JSON report of empty or broken lessons across all courses. */
export async function GET() {
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const rows = await fetchBrokenLessonsReport(auth.admin);
  return NextResponse.json({ count: rows.length, rows });
}
