import "server-only";
import { bootstrapPlatformSecrets } from "@/lib/platform-secrets-bootstrap";

/** Load runtime-env.json and platform_secrets into the integration secret cache. */
export async function bootstrapRuntimeSecrets() {
  await bootstrapPlatformSecrets();
}
