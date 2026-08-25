import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { checkStudentCourseEnrollment } from "@/lib/student-enrollments";
import { getContaboIntegrationStatus, getStorageService } from "@/lib/storage";

/**
 * Streams a private resource file (Contabo/server storage preferred, Supabase fallback).
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
    .select("id, course_id, file_url, download_allowed, is_archived, title")
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

  if (/^https?:\/\//.test(resource.file_url)) {
    return NextResponse.redirect(resource.file_url);
  }

  const contabo = getContaboIntegrationStatus();
  if (contabo.configured) {
    try {
      const storage = getStorageService();
      const body = await storage.download(resource.file_url);
      const meta = await storage.getMetadata(resource.file_url).catch(() => null);
      const filename = (resource.title || "download").replace(/[^\w.\- ]+/g, "_");
      const contentType =
        meta?.contentType ||
        (/\.pdf$/i.test(resource.file_url) ? "application/pdf" : "application/octet-stream");
      return new NextResponse(new Uint8Array(body), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch (err) {
      console.error("[resources-download] Contabo read failed, trying Supabase:", err);
    }
  }

  const { data, error } = await admin.storage
    .from("private-files")
    .createSignedUrl(resource.file_url, 3600);
  if (error || !data) return new NextResponse("Unable to fetch file from storage", { status: 500 });

  return NextResponse.redirect(data.signedUrl);
}
