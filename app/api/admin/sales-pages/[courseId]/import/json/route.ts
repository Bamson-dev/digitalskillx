import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";

type Ctx = { params: { courseId: string } };

/** JSON WordPress import retired — use /admin/landing-pages URL importer. */
export async function POST(_request: Request, _ctx: Ctx) {
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;
  return NextResponse.json(
    {
      error:
        "JSON landing-page import is retired. Use Admin → Landing imports to paste a public URL.",
      code: "JSON_IMPORT_RETIRED",
      replacement: "/admin/landing-pages",
    },
    { status: 410 },
  );
}
