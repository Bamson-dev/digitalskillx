import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { sha256Buffer, sanitizeStoragePath } from "./path-safety";
import type {
  StorageAdapter,
  StorageObjectMetadata,
  StorageProviderName,
  StorageUploadInput,
  StorageUploadResult,
} from "./types";

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional public base URL (CDN or Contabo public bucket URL). */
  publicBaseUrl?: string;
  forcePathStyle?: boolean;
  providerName?: Extract<StorageProviderName, "s3" | "contabo-s3">;
};

/**
 * S3-compatible adapter (Contabo Object Storage preferred).
 * Requires env credentials — never hardcodes secrets.
 */
export class S3CompatibleStorageAdapter implements StorageAdapter {
  readonly provider: StorageProviderName;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl?: string;

  constructor(config: S3StorageConfig) {
    this.provider = config.providerName ?? "s3";
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl?.replace(/\/$/, "");
    this.client = new S3Client({
      region: config.region || "default",
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle !== false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const safePath = sanitizeStoragePath(input.path);
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safePath,
        Body: body,
        ContentType: input.contentType,
        ACL: input.isPublic ? "public-read" : undefined,
      }),
    );
    return {
      path: safePath,
      size: body.length,
      contentType: input.contentType,
      checksumSha256: sha256Buffer(body),
      provider: this.provider,
    };
  }

  async download(rawPath: string): Promise<Buffer> {
    const safePath = sanitizeStoragePath(rawPath);
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: safePath }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("Empty object body.");
    return Buffer.from(bytes);
  }

  async delete(rawPath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: sanitizeStoragePath(rawPath),
      }),
    );
  }

  async exists(rawPath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: sanitizeStoragePath(rawPath),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(rawPath: string): Promise<StorageObjectMetadata | null> {
    try {
      const safePath = sanitizeStoragePath(rawPath);
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: safePath }),
      );
      return {
        path: safePath,
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? "application/octet-stream",
        etag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch {
      return null;
    }
  }

  getPublicUrl(rawPath: string): string | null {
    if (!this.publicBaseUrl) return null;
    return `${this.publicBaseUrl}/${sanitizeStoragePath(rawPath)}`;
  }

  async copy(fromPath: string, toPath: string): Promise<void> {
    const src = sanitizeStoragePath(fromPath);
    const dest = sanitizeStoragePath(toPath);
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${src}`,
        Key: dest,
      }),
    );
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    await this.copy(fromPath, toPath);
    await this.delete(fromPath);
  }
}
