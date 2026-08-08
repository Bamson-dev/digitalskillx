import { mkdir, readFile, rm, stat, writeFile, copyFile, rename } from "node:fs/promises";
import path from "node:path";
import { sha256Buffer, sanitizeStoragePath } from "./path-safety";
import type {
  StorageAdapter,
  StorageObjectMetadata,
  StorageProviderName,
  StorageUploadInput,
  StorageUploadResult,
} from "./types";

/**
 * Local / temporary adapter for tests and when Contabo credentials are absent.
 * Files live under a configurable root (default: .data/storage).
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly provider: StorageProviderName = "local";
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }
  private resolve(rawPath: string): string {
    const safe = sanitizeStoragePath(rawPath);
    const full = path.resolve(this.rootDir, safe);
    const root = path.resolve(this.rootDir);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error("Resolved path escaped storage root.");
    }
    return full;
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const safePath = sanitizeStoragePath(input.path);
    const full = this.resolve(safePath);
    await mkdir(path.dirname(full), { recursive: true });
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
    await writeFile(full, body);
    return {
      path: safePath,
      size: body.length,
      contentType: input.contentType,
      checksumSha256: sha256Buffer(body),
      provider: this.provider,
    };
  }

  async download(rawPath: string): Promise<Buffer> {
    return readFile(this.resolve(rawPath));
  }

  async delete(rawPath: string): Promise<void> {
    await rm(this.resolve(rawPath), { force: true });
  }

  async exists(rawPath: string): Promise<boolean> {
    try {
      await stat(this.resolve(rawPath));
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(rawPath: string): Promise<StorageObjectMetadata | null> {
    try {
      const full = this.resolve(rawPath);
      const s = await stat(full);
      return {
        path: sanitizeStoragePath(rawPath),
        size: s.size,
        contentType: "application/octet-stream",
        lastModified: s.mtime,
      };
    } catch {
      return null;
    }
  }

  getPublicUrl(): string | null {
    return null;
  }

  async copy(fromPath: string, toPath: string): Promise<void> {
    const dest = this.resolve(toPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(this.resolve(fromPath), dest);
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    const dest = this.resolve(toPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(this.resolve(fromPath), dest);
  }
}

/** Contabo VPS (or any server) filesystem storage — never expose raw paths over HTTP. */
export class FilesystemStorageAdapter extends LocalStorageAdapter {
  override readonly provider: StorageProviderName = "filesystem";
}
