import { NextResponse, type NextRequest } from "next/server";
import { runStudentSignUp } from "@/lib/auth/run-student-signup";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";

/** Student self-registration — mirrors login route for reliable form / test clients. */
export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "auth-register", 10);
  if (limited) return limited;

  const contentType = request.headers.get("content-type") ?? "";
  let fullName = "";
  let email = "";
  let password = "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as {
        full_name?: string;
        email?: string;
        password?: string;
      };
      fullName = String(body.full_name ?? "");
      email = String(body.email ?? "");
      password = String(body.password ?? "");
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
  } else {
    const formData = await request.formData();
    fullName = String(formData.get("full_name") ?? "");
    email = String(formData.get("email") ?? "");
    password = String(formData.get("password") ?? "");
  }

  const result = await runStudentSignUp({ fullName, email, password });
  if (!result.ok) {
    if (contentType.includes("application/json")) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const errorUrl = new URL("/register", request.url);
    errorUrl.searchParams.set("auth_error", result.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  if (contentType.includes("application/json")) {
    return NextResponse.json({ message: result.message });
  }

  const okUrl = new URL("/login", request.url);
  okUrl.searchParams.set("registered", "1");
  return NextResponse.redirect(okUrl, 303);
}
