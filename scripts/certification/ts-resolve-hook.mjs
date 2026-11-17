/**
 * Node ESM resolve hook: allow extensionless relative imports of .ts files
 * (matches Next/bundler resolution for offline certification scripts).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const stubServerOnly = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "stubs/server-only.mjs"),
).href;

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: stubServerOnly, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const rel = join(root, specifier.slice(2));
    for (const ext of [".ts", ".tsx", ".js", ".mjs", "/index.ts"]) {
      try {
        return await nextResolve(pathToFileURL(`${rel}${ext}`).href, context);
      } catch {
        // try next extension
      }
    }
    try {
      return await nextResolve(pathToFileURL(rel).href, context);
    } catch {
      // fall through
    }
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[cm]?[jt]sx?$/.test(specifier) &&
    !specifier.endsWith(".json") &&
    !specifier.endsWith(".md")
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // fall through
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Next ships CommonJS entry points such as next/headers without an exports map.
    if (specifier.startsWith("next/") && !/\.[cm]?js$/.test(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".md")) {
    const source = `export default ${JSON.stringify(readFileSync(fileURLToPath(url), "utf8"))};`;
    return { format: "module", source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
