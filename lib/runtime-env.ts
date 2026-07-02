import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type RuntimeEnvFile = Record<string, string>;

let cachedFile: RuntimeEnvFile | null | undefined;

export function runtimeEnvFilePaths(): string[] {
  const cwd = process.cwd();
  const fromEnv = process.env.DIGITALSKILLX_RUNTIME_ENV_FILE?.trim();

  return [
    fromEnv,
    "/tmp/digitalskillx-runtime-env.json",
    join(cwd, "runtime-env.json"),
    join(cwd, ".next", "runtime-env.json"),
    "/app/runtime-env.json",
    "/app/.next/runtime-env.json",
  ].filter((path): path is string => Boolean(path));
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

export function runtimeEnvDiagnostics() {
  const paths = runtimeEnvFilePaths();
  const checked = paths.map((path) => ({ path, exists: existsSync(path) }));
  const loaded = readRuntimeEnvFile();
  const hasYoutube = Boolean(loaded.YOUTUBE_API_KEY?.trim());

  return {
    cwd: process.cwd(),
    checkedPaths: checked,
    runtimeFileLoaded: hasYoutube,
    runtimeFileKeys: Object.keys(loaded),
  };
}

export function runtimeEnvWithSource(name: string): {
  value: string | undefined;
  source: RuntimeEnvSource;
  loadedFromPath?: string;
} {
  for (const path of runtimeEnvFilePaths()) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as RuntimeEnvFile;
      const fromFile = parsed?.[name];
      if (typeof fromFile === "string" && fromFile.trim()) {
        cachedFile = parsed;
        return { value: fromFile.trim(), source: "file", loadedFromPath: path };
      }
    } catch {
      // try next path
    }
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
