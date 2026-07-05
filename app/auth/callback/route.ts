import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

function otpTypeFromParam(type: string | null): EmailOtpType | null {
  if (type === "recovery" || type === "magiclink" || type === "email" || type === "signup") {
    return type;
  }
  return null;
}

async function redirectAfterAuth(
  supabase: ReturnType<typeof createClient>,
  origin: string,
  next: string | null,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "student" && profile.email) {
      try {
        const { createAdminClientAsync } = await import("@/lib/supabase/admin");
        const { syncStudentCourseAccess, reconcileOrphanCertificatesForEmail } = await import(
          "@/lib/admin-student-onboarding"
        );
        const admin = await createAdminClientAsync(supabase);
        await syncStudentCourseAccess(admin, {
          authUserId: user.id,
          profileEmail: profile.email,
        });
        await reconcileOrphanCertificatesForEmail(admin, {
          authUserId: user.id,
          email: profile.email.trim().toLowerCase(),
        });
      } catch (err) {
        console.error("[auth/callback] student access sync failed:", err);
      }

      const { sendWelcomeEmailIfNeeded, parseCourseIdFromNext } = await import(
        "@/lib/system-email-triggers"
      );
      void sendWelcomeEmailIfNeeded({
        studentId: user.id,
        fullName: profile.full_name ?? user.user_metadata?.full_name ?? "there",
        email: profile.email,
        checkoutCourseId: parseCourseIdFromNext(next),
      });
    }

    if (next?.startsWith("/")) {
      return NextResponse.redirect(`${origin}${next}`);
    }

    const home = profile?.role === "admin" ? "/admin/dashboard" : "/dashboard";
    return NextResponse.redirect(`${origin}${home}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

/**
 * OAuth / magic-link / password-reset callback.
 * Server-generated links use token_hash + verifyOtp; client OAuth uses code exchange.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = otpTypeFromParam(searchParams.get("type"));
  const next = searchParams.get("next");

  const supabase = createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return redirectAfterAuth(supabase, origin, next);
    }
    console.error("[auth/callback] verifyOtp failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_link_invalid`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectAfterAuth(supabase, origin, next);
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
