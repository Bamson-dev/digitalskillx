import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";

/**
 * Content Factory + Free Learning Library feature flag.
 * Default: disabled (opt-in) until production env enables it.
 */
export function contentFactoryEnabled(): boolean {
  const raw = (
    process.env.CONTENT_FACTORY_ENABLED ??
    runtimeEnv("CONTENT_FACTORY_ENABLED") ??
    "false"
  )
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}
