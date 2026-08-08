import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * Normalize and validate a storage-relative path.
 * Rejects absolute paths, traversal, and unsafe segments.
 */
export function sanitizeStoragePath(raw: string): string {
  const value = String(raw ?? "").trim().replace(/\\/g, "/");
  if (!value) throw new Error("Storage path is required.");
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) {
    throw new Error("Absolute storage paths are not allowed.");
  }
  const parts = value.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("Storage path is required.");
  for (const part of parts) {
    if (part === "." || part === "..") {
      throw new Error("Path traversal is not allowed.");
    }
    if (!SAFE_SEGMENT.test(part)) {
      throw new Error("Storage path contains invalid characters.");
    }
  }
  return parts.join("/");
}

/** Safe unique filename from an original name (extension preserved when allowed). */
export function uniqueStorageFilename(
  originalName: string,
  allowedExt: Set<string>,
): { filename: string; ext: string } {
  const base = path.basename(String(originalName || "file")).replace(/[^\w.-]+/g, "_");
  const ext = (path.extname(base).replace(".", "").toLowerCase() || "bin");
  if (!allowedExt.has(ext)) {
    throw new Error(`File extension .${ext} is not allowed.`);
  }
  const stem = path.basename(base, path.extname(base)).slice(0, 40) || "asset";
  return {
    filename: `${Date.now()}-${randomUUID().slice(0, 8)}-${stem}.${ext}`,
    ext,
  };
}

export function sha256Buffer(body: Buffer | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function sniffImageMime(body: Buffer | Uint8Array): string | null {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 6 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) {
    return "image/gif";
  }
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  return null;
}
