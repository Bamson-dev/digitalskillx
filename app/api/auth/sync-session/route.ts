import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

/** Persist browser auth tokens into Next.js cookies so middleware and RSC see the session. */
export async function POST(request: NextRequest) {
  let body: { access_token?: string; refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const access_token = body.access_token?.trim();
  const refresh_token = body.refresh_token?.trim();
  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "Missing session tokens." }, { status: 400 });
  }

  let response = NextResponse.json({ ok: true });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return response;
}
