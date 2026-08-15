import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { checkStudentCourseEnrollment } from "@/lib/student-enrollments";

/**
 * Issues a short-lived signed URL for a private resource file (PRD §18, §20).
 *
 * Access must match lesson pages: enrolled students (after enrollment sync) and
 * admins. Do not rely only on session RLS `is_enrolled(auth.uid())`, because
 * enrollments may be linked under a synced student id.
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

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync(supabase);

  const { data: resource } = await admin
    .from("resources")
    .select("id, course_id, file_url, download_allowed, is_archived")
    .eq("id", params.id)
    .maybeSingle();

  if (!resource || resource.is_archived || !resource.download_allowed || !resource.file_url) {
    return new NextResponse("Not available", { status: 403 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" && !profile.is_suspended;
  if (!isAdmin) {
    if (profile?.is_suspended) {
      return new NextResponse("Not available", { status: 403 });
    }
    const { enrolled } = await checkStudentCourseEnrollment(user.id, resource.course_id);
    if (!enrolled) {
      return new NextResponse("Not available", { status: 403 });
    }
  }

  // Absolute URLs are returned as-is; otherwise treat as a private-bucket path.
  if (/^https?:\/\//.test(resource.file_url)) {
    return NextResponse.redirect(resource.file_url);
  }

  const { data, error } = await admin.storage
    .from("private-files")
    .createSignedUrl(resource.file_url, 3600);
  if (error || !data) return new NextResponse("Unable to sign URL", { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
