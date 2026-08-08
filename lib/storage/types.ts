/**
 * DigitalSkillX storage abstraction.
 * Production target: Contabo (S3-compatible Object Storage preferred; VPS filesystem supported).
 * Existing Supabase Storage helpers are intentionally separate and untouched.
 */

export type StorageProviderName = "local" | "filesystem" | "s3" | "contabo-s3";

export type StorageObjectMetadata = {
  path: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: Date;
};

export type StorageUploadInput = {
  /** Logical path under the storage root, e.g. sales-page-assets/{courseId}/{assetId}.webp */
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /** When true, object is eligible for public URL generation. */
  isPublic?: boolean;
};

export type StorageUploadResult = {
  path: string;
  size: number;
  contentType: string;
  checksumSha256: string;
  provider: StorageProviderName;
};

export interface StorageAdapter {
  readonly provider: StorageProviderName;
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getMetadata(path: string): Promise<StorageObjectMetadata | null>;
  /** Absolute or CDN-ready URL when the provider can expose one; otherwise null. */
  getPublicUrl(path: string): string | null;
  copy(fromPath: string, toPath: string): Promise<void>;
  move(fromPath: string, toPath: string): Promise<void>;
}

export type StorageService = StorageAdapter & {
  validatePath(path: string): string;
  replace(input: StorageUploadInput): Promise<StorageUploadResult>;
};
