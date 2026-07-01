import "server-only";
import { headers } from "next/headers";

export function clientIpFromHeaders(): string {
  try {
    const h = headers();
    const xf = h.get("x-forwarded-for");
    if (xf) return xf.split(",")[0]?.trim() ?? "unknown";
    return h.get("x-real-ip") ?? "unknown";
  } catch {
    return "unknown";
  }
}
