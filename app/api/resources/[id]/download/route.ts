import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

/**
 * Issues a short-lived signed URL for a private resource file (PRD §18, §20).
 * Access is authorised through RLS: the user client can only read the resource
 * row if the student is enrolled in the course (or is admin).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const limited = await rateLimitedResponse(request, "resources-download", 100);
  if (limited) return limited;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: resource } = await supabase
    .from("resources")
    .select("file_url, download_allowed")
    .eq("id", params.id)
    .single();

  if (!resource || !resource.download_allowed) {
    return new NextResponse("Not available", { status: 403 });
  }

  // Absolute URLs are returned as-is; otherwise treat as a private-bucket path.
  if (/^https?:\/\//.test(resource.file_url)) {
    return NextResponse.redirect(resource.file_url);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("private-files")
    .createSignedUrl(resource.file_url, 3600);
  if (error || !data) return new NextResponse("Unable to sign URL", { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
