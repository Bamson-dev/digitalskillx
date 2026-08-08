import { unzipSync } from "fflate";
import { STORAGE_LIMITS, ALLOWED_RESOURCE_EXT } from "../../storage/limits";

export type ZipExtractedFile = {
  path: string;
  data: Uint8Array;
};

export type ZipExtractResult =
  | { ok: true; pageJson: unknown; assets: ZipExtractedFile[]; warnings: string[] }
  | { ok: false; error: string };

function normalizeZipPath(name: string): string | null {
  const cleaned = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.endsWith("/")) return null;
  if (cleaned.includes("..") || cleaned.startsWith("/") || /^[a-zA-Z]:/.test(cleaned)) {
    return null;
  }
  // Reject nested archives
  if (/\.(zip|tar|gz|tgz|7z|rar)$/i.test(cleaned)) return null;
  return cleaned;
}

/**
 * Safely extract a Sales Page ZIP (page.json + assets/).
 * Protects against path traversal, zip bombs, and disallowed types.
 */
export function extractSalesPageZip(zipBytes: Uint8Array): ZipExtractResult {
  if (zipBytes.byteLength > STORAGE_LIMITS.maxZipBytes) {
    return { ok: false, error: "ZIP exceeds maximum allowed size." };
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes, {
      filter: (file) => {
        const name = normalizeZipPath(file.name);
        return Boolean(name);
      },
    });
  } catch {
    return { ok: false, error: "Invalid or malformed ZIP archive." };
  }

  const names = Object.keys(entries);
  if (names.length === 0) return { ok: false, error: "ZIP is empty or contained only unsafe paths." };
  if (names.length > STORAGE_LIMITS.maxZipEntries) {
    return { ok: false, error: "ZIP contains too many files." };
  }

  let total = 0;
  for (const data of Object.values(entries)) {
    total += data.byteLength;
    if (total > STORAGE_LIMITS.maxZipExtractBytes) {
      return { ok: false, error: "ZIP extraction exceeds maximum uncompressed size." };
    }
  }

  const warnings: string[] = [];
  let pageJsonRaw: Uint8Array | null = null;
  const assets: ZipExtractedFile[] = [];

  for (const [rawName, data] of Object.entries(entries)) {
    const name = normalizeZipPath(rawName);
    if (!name) continue;
    const lower = name.toLowerCase();
    if (lower === "page.json" || lower.endsWith("/page.json")) {
      pageJsonRaw = data;
      continue;
    }
    if (lower.startsWith("assets/") || lower.includes("/assets/")) {
      const base = name.split("/").pop() ?? "";
      const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
      if (!ALLOWED_RESOURCE_EXT.has(ext)) {
        warnings.push(`Skipped disallowed asset: ${base}`);
        continue;
      }
      assets.push({ path: name, data });
      continue;
    }
    warnings.push(`Ignored unexpected ZIP entry: ${name}`);
  }

  if (!pageJsonRaw) {
    return { ok: false, error: "ZIP must contain page.json at the archive root (or nested once)." };
  }

  let pageJson: unknown;
  try {
    pageJson = JSON.parse(Buffer.from(pageJsonRaw).toString("utf8"));
  } catch {
    return { ok: false, error: "page.json is not valid JSON." };
  }

  return { ok: true, pageJson, assets, warnings };
}
