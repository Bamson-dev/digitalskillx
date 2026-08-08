/** Configurable storage / import limits (documented for ops). */

export const STORAGE_LIMITS = {
  /** Max single asset upload (bytes). */
  maxFileBytes: 8 * 1024 * 1024,
  /** Max ZIP package size (bytes). */
  maxZipBytes: 40 * 1024 * 1024,
  /** Max files extracted from a ZIP. */
  maxZipEntries: 200,
  /** Max total uncompressed extraction size. */
  maxZipExtractBytes: 80 * 1024 * 1024,
  /** Max JSON import body size. */
  maxJsonBytes: 8 * 1024 * 1024,
  /** Max assets processed per import. */
  maxAssetsPerImport: 80,
  /** Max remote download size. */
  maxRemoteDownloadBytes: 8 * 1024 * 1024,
  /** Remote download timeout. */
  remoteDownloadTimeoutMs: 20_000,
} as const;

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const ALLOWED_IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export const ALLOWED_RESOURCE_MIME = new Set([
  ...ALLOWED_IMAGE_MIME,
  "application/pdf",
]);

export const ALLOWED_RESOURCE_EXT = new Set([...ALLOWED_IMAGE_EXT, "pdf"]);
