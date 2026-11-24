import { cookies, headers } from "next/headers";
import { createRequestClient, type DbClient } from "@/lib/db/client";
import type { CookieJar } from "@/lib/db/auth";

/**
 * Database client for Server Components, Route Handlers and Server Actions.
 * Bound to the request cookie store so the signed-in user's session is available
 * server-side. Row level security is enforced for this client.
 */
export function createClient(): DbClient {
  const cookieStore = cookies();
  const jar: CookieJar = {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(list) {
      try {
        list.forEach(({ name, value, options }) => cookieStore.set(name, value, options as never));
      } catch {
        // Server Components cannot set cookies. Route handlers and actions can.
      }
    },
  };
  return createRequestClient(jar, () => {
    let h: Headers | null = null;
    try {
      h = headers();
    } catch {
      h = null;
    }
    return {
      userAgent: h?.get("user-agent") ?? null,
      ip: h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    };
  });
}
