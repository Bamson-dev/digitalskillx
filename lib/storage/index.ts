import path from "node:path";
import { LocalStorageAdapter, FilesystemStorageAdapter } from "./local-adapter";
import { S3CompatibleStorageAdapter } from "./s3-adapter";
import { sanitizeStoragePath } from "./path-safety";
import type { StorageAdapter, StorageService, StorageUploadInput } from "./types";

/** Prefer process.env so this module stays usable in unit tests (no server-only). */
function env(name: string): string | undefined {
  return (process.env[name] ?? "").trim() || undefined;
}

export type ContaboIntegrationStatus = {
  configured: boolean;
  provider: string;
  verified: false;
  reason: string;
};

/**
 * Contabo production connection is NOT claimed verified until credentials exist
 * and an integration test succeeds against the live endpoint.
 */
export function getContaboIntegrationStatus(): ContaboIntegrationStatus {
  const provider = (env("STORAGE_PROVIDER") ?? "local").toLowerCase();
  const hasS3 =
    Boolean(env("CONTABO_S3_ENDPOINT") || env("STORAGE_S3_ENDPOINT")) &&
    Boolean(env("CONTABO_S3_ACCESS_KEY") || env("STORAGE_S3_ACCESS_KEY")) &&
    Boolean(env("CONTABO_S3_SECRET_KEY") || env("STORAGE_S3_SECRET_KEY")) &&
    Boolean(env("CONTABO_S3_BUCKET") || env("STORAGE_S3_BUCKET"));
  const hasFs = Boolean(env("CONTABO_STORAGE_ROOT") || env("STORAGE_FS_ROOT"));

  if ((provider === "s3" || provider === "contabo-s3" || provider === "contabo") && hasS3) {
    return {
      configured: true,
      provider: "contabo-s3",
      verified: false,
      reason:
        "Contabo S3-compatible credentials are present in env, but live Contabo production storage has not been verified in this environment.",
    };
  }
  if ((provider === "filesystem" || provider === "contabo-fs") && hasFs) {
    return {
      configured: true,
      provider: "filesystem",
      verified: false,
      reason:
        "Contabo VPS filesystem root is configured, but live Contabo production storage has not been verified in this environment.",
    };
  }
  return {
    configured: false,
    provider: "local",
    verified: false,
    reason:
      "Contabo production connection not yet verified because production credentials/configuration are not available.",
  };
}

export function createStorageAdapterFromEnv(): StorageAdapter {
  const provider = (env("STORAGE_PROVIDER") ?? "local").toLowerCase();

  if (provider === "s3" || provider === "contabo-s3" || provider === "contabo") {
    const endpoint = env("CONTABO_S3_ENDPOINT") ?? env("STORAGE_S3_ENDPOINT");
    const accessKeyId = env("CONTABO_S3_ACCESS_KEY") ?? env("STORAGE_S3_ACCESS_KEY");
    const secretAccessKey = env("CONTABO_S3_SECRET_KEY") ?? env("STORAGE_S3_SECRET_KEY");
    const bucket = env("CONTABO_S3_BUCKET") ?? env("STORAGE_S3_BUCKET");
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        "STORAGE_PROVIDER requires Contabo/S3 env: CONTABO_S3_ENDPOINT, CONTABO_S3_ACCESS_KEY, CONTABO_S3_SECRET_KEY, CONTABO_S3_BUCKET.",
      );
    }
    return new S3CompatibleStorageAdapter({
      endpoint,
      region: env("CONTABO_S3_REGION") ?? env("STORAGE_S3_REGION") ?? "default",
      bucket,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl: env("CONTABO_S3_PUBLIC_BASE_URL") ?? env("STORAGE_PUBLIC_BASE_URL"),
      forcePathStyle: true,
      providerName: "contabo-s3",
    });
  }

  if (provider === "filesystem" || provider === "contabo-fs") {
    const root = env("CONTABO_STORAGE_ROOT") ?? env("STORAGE_FS_ROOT");
    if (!root) {
      throw new Error("STORAGE_PROVIDER=filesystem requires CONTABO_STORAGE_ROOT.");
    }
    return new FilesystemStorageAdapter(root);
  }

  const localRoot =
    env("STORAGE_LOCAL_ROOT") ?? path.join(process.cwd(), ".data", "storage");
  return new LocalStorageAdapter(localRoot);
}

let cached: StorageService | null = null;

export function wrapStorageAdapter(adapter: StorageAdapter): StorageService {
  return {
    provider: adapter.provider,
    validatePath: sanitizeStoragePath,
    upload: (input) => adapter.upload(input),
    download: (p) => adapter.download(p),
    delete: (p) => adapter.delete(p),
    exists: (p) => adapter.exists(p),
    getMetadata: (p) => adapter.getMetadata(p),
    getPublicUrl: (p) => adapter.getPublicUrl(p),
    copy: (a, b) => adapter.copy(a, b),
    move: (a, b) => adapter.move(a, b),
    async replace(input: StorageUploadInput) {
      const safe = sanitizeStoragePath(input.path);
      if (await adapter.exists(safe)) {
        await adapter.delete(safe);
      }
      return adapter.upload({ ...input, path: safe });
    },
  };
}

/** App-wide storage service (Sales Page assets, future Contabo-backed files). */
export function getStorageService(): StorageService {
  if (!cached) {
    cached = wrapStorageAdapter(createStorageAdapterFromEnv());
  }
  return cached;
}

/** Test helper — bypasses env cache. */
export function createStorageServiceForTests(adapter: StorageAdapter): StorageService {
  return wrapStorageAdapter(adapter);
}

export function resetStorageServiceCache(): void {
  cached = null;
}
