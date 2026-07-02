import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type RuntimeEnvFile = Record<string, string>;

let cachedFile: RuntimeEnvFile | null | undefined;

function runtimeEnvFilePaths() {
  const cwd = process.cwd();
  return [join(cwd, ".next", "runtime-env.json"), join(cwd, "runtime-env.json")];
}

function readRuntimeEnvFile(): RuntimeEnvFile {
  if (cachedFile !== undefined) return cachedFile ?? {};

  cachedFile = {};
  for (const path of runtimeEnvFilePaths()) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as RuntimeEnvFile;
      cachedFile = parsed && typeof parsed === "object" ? parsed : {};
      return cachedFile;
    } catch {
      // try next path
    }
  }

  return cachedFile;
}

/** Where a runtime secret was resolved from (for diagnostics). */
export type RuntimeEnvSource = "file" | "process" | "missing";

export function runtimeEnvWithSource(name: string): {
  value: string | undefined;
  source: RuntimeEnvSource;
} {
  const fromFile = readRuntimeEnvFile()[name];
  if (typeof fromFile === "string" && fromFile.trim()) {
    return { value: fromFile.trim(), source: "file" };
  }

  // Dynamic lookup avoids Next.js/webpack inlining build-time undefined.
  const env = process.env as Record<string, string | undefined>;
  const fromProcess = env[name]?.trim();
  if (fromProcess) return { value: fromProcess, source: "process" };

  return { value: undefined, source: "missing" };
}

export function runtimeEnv(name: string): string | undefined {
  return runtimeEnvWithSource(name).value;
}
