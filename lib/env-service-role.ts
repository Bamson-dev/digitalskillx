import "server-only";
import { isDatabaseConfigured } from "@/lib/db/pool";

/**
 * Compatibility shim. The old service-role key no longer exists: privileged
 * access is the DATABASE_URL connection, which only the server holds.
 */
export function setServiceRoleKeyCache(_key: string) {}

export function getServiceRoleKeySync(): string | undefined {
  return isDatabaseConfigured() ? process.env.DATABASE_URL : undefined;
}

export type ServiceRoleKeyResolution = { key?: string; hint?: string };

export async function resolveServiceRoleKey(_client?: unknown): Promise<ServiceRoleKeyResolution> {
  const key = getServiceRoleKeySync();
  return key ? { key } : { hint: serviceRoleKeyMissingMessage() };
}

export async function bootstrapServiceRoleKey(_client?: unknown): Promise<string | undefined> {
  return getServiceRoleKeySync();
}

export async function serviceRoleKeyConfigured(_client?: unknown) {
  return isDatabaseConfigured();
}

export function serviceRoleKeyMissingMessage() {
  return "DATABASE_URL is not set. Add it to this deployment's runtime environment and redeploy.";
}

export async function serviceRoleKeyMissingMessageAsync(): Promise<string> {
  return serviceRoleKeyMissingMessage();
}
