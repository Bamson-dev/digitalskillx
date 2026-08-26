import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  assertDeviceLoginAllowed,
  DEVICE_KEY_COOKIE,
  newDeviceKey,
  readDeviceKeyFromRequest,
} from "@/lib/device-login-limit";

function otpTypeFromParam(type: string | null): EmailOtpType | null {
  if (type === "recovery" || type === "magiclink" || type === "email" || type === "signup") {
    return type;
  }
  return null;
}

async function redirectAfterAuth(
  request: NextRequest,
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

    const deviceKey = readDeviceKeyFromRequest(request) || newDeviceKey();

    if (profile?.role === "student") {
      try {
        const { createAdminClientAsync } = await import("@/lib/supabase/admin");
        const admin = await createAdminClientAsync(supabase);
        const decision = await assertDeviceLoginAllowed(admin, {
          studentId: user.id,
          deviceKey,
          role: profile.role,
        });
        if (!decision.allowed) {
          await supabase.auth.signOut();
          const login = new URL("/login", origin);
          login.searchParams.set("auth_error", decision.error);
          const res = NextResponse.redirect(login);
          res.cookies.set(DEVICE_KEY_COOKIE, deviceKey, {
            path: "/",
            maxAge: 60 * 60 * 24 * 400,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            httpOnly: false,
          });
          return res;
        }
      } catch (err) {
        console.error("[auth/callback] device limit check failed:", err);
      }
    }

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

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          const { trackAccountSession } = await import("@/lib/account-sessions");
          const ua = request.headers.get("user-agent");
          const forwarded = request.headers.get("x-forwarded-for");
          const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
          await trackAccountSession(admin, {
            userId: user.id,
            accessToken: session.access_token,
            deviceKey,
            meta: {
              userAgent: ua,
              ipAddress: ip,
              country: request.headers.get("x-vercel-ip-country"),
              city: request.headers.get("x-vercel-ip-city"),
              latitude: Number(request.headers.get("x-vercel-ip-latitude")) || null,
              longitude: Number(request.headers.get("x-vercel-ip-longitude")) || null,
            },
          });
        }
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

    const dest =
      next?.startsWith("/")
        ? `${origin}${next}`
        : `${origin}${profile?.role === "admin" ? "/admin/dashboard" : "/dashboard"}`;
    const res = NextResponse.redirect(dest);
    res.cookies.set(DEVICE_KEY_COOKIE, deviceKey, {
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    });
    return res;
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
      return redirectAfterAuth(request, supabase, origin, next);
    }
    console.error("[auth/callback] verifyOtp failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_link_invalid`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectAfterAuth(request, supabase, origin, next);
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
