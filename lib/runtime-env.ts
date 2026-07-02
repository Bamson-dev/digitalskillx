import "server-only";

/**
 * Read an env var at runtime. Bracket access avoids Next.js/webpack inlining
 * values from the Docker build step when Coolify only injects vars at runtime.
 */
export function runtimeEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}
