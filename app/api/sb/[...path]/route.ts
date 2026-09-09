import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseFetch } from "@/lib/supabase/fetch-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Same-origin Supabase gateway.
 * Public DNS for supabase.digitalskillx.com is unreliable/missing; browsers talk to
 * https://www.digitalskillx.com/api/sb/* and we forward to Kong via Docker DNS bridge.
 */
function upstreamBase(): string {
  const env = process.env as Record<string, string | undefined>;
  return (
    env.SUPABASE_UPSTREAM_URL?.trim() ||
    "https://supabase.digitalskillx.com"
  ).replace(/\/$/, "");
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function proxy(request: NextRequest, pathParts: string[]) {
  const path = (pathParts ?? []).join("/");
  const target = `${upstreamBase()}/${path}${request.nextUrl.search}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const fetchFn = createServerSupabaseFetch({ retries: 1, timeoutMs: 45_000 });
  let upstream: Response;
  try {
    upstream = await fetchFn(target, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream_fetch_failed";
    return NextResponse.json(
      { error: "supabase_upstream_unreachable", message },
      { status: 502 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    // Avoid leaking upstream encoding mismatches through Next.
    if (key.toLowerCase() === "content-encoding") return;
    out.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

type Ctx = { params: { path: string[] } };

export async function GET(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path ?? []);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path ?? []);
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path ?? []);
}
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path ?? []);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return proxy(request, ctx.params.path ?? []);
}
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range",
    },
  });
}
