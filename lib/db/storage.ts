import { createHmac, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Bucket-style file storage on a persistent volume (STORAGE_FS_ROOT).
 * Same call surface the app used for its two buckets: upload, download,
 * createSignedUrl, getPublicUrl, remove, list, and bucket management.
 * Files are served through /api/storage/... (public bucket, or signed links).
 */

type StorageError = { message: string; statusCode?: string; name: string };
const fail = (message: string, statusCode = "400"): StorageError => ({ message, statusCode, name: "StorageError" });

export function storageRoot(): string {
  const root = process.env.STORAGE_FS_ROOT?.trim() || process.env.STORAGE_LOCAL_ROOT?.trim() || path.join(process.cwd(), ".data", "storage");
  return path.resolve(root);
}

const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,62}$/;

function safeJoin(bucket: string, objectPath: string): string {
  if (!BUCKET_RE.test(bucket)) throw new Error("Invalid bucket name");
  const clean = objectPath.replace(/^\/+/, "");
  if (!clean || clean.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) {
    throw new Error("Invalid object path");
  }
  const base = path.join(storageRoot(), bucket);
  const full = path.resolve(base, clean);
  if (!full.startsWith(base + path.sep)) throw new Error("Invalid object path");
  return full;
}

function signingKey(): string {
  const k = process.env.AUTH_JWT_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!k) throw new Error("Set AUTH_JWT_SECRET (or CRON_SECRET) to sign storage links");
  return `dsx-storage-v1|${k}`;
}

export function signStorageToken(bucket: string, objectPath: string, expiresAt: number): string {
  return createHmac("sha256", signingKey()).update(`${bucket}\n${objectPath}\n${expiresAt}`).digest("hex");
}

export function verifyStorageToken(bucket: string, objectPath: string, expiresAt: number, token: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signStorageToken(bucket, objectPath, expiresAt));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const META_SUFFIX = ".meta.json";

async function readMeta(file: string): Promise<{ contentType?: string } | null> {
  try {
    return JSON.parse(await fs.readFile(file + META_SUFFIX, "utf8"));
  } catch {
    return null;
  }
}

export function publicBuckets(): string[] {
  return (process.env.STORAGE_PUBLIC_BUCKETS ?? "public-assets").split(",").map((s) => s.trim()).filter(Boolean);
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").replace(/\/$/, "");
}

export type StorageApi = ReturnType<typeof createStorageApi>;

export function createStorageApi() {
  return {
    from(bucket: string) {
      return {
        async upload(
          objectPath: string,
          body: Buffer | ArrayBuffer | Uint8Array | Blob | string,
          options?: { contentType?: string; upsert?: boolean; cacheControl?: string },
        ) {
          try {
            const file = safeJoin(bucket, objectPath);
            if (!options?.upsert) {
              const exists = await fs.stat(file).then(() => true, () => false);
              if (exists) return { data: null, error: fail("The resource already exists", "409") };
            }
            await fs.mkdir(path.dirname(file), { recursive: true });
            let buf: Buffer;
            if (typeof body === "string") buf = Buffer.from(body);
            else if (body instanceof Blob) buf = Buffer.from(await body.arrayBuffer());
            else if (body instanceof ArrayBuffer) buf = Buffer.from(body);
            else buf = Buffer.from(body as Uint8Array);
            const tmp = `${file}.${process.pid}.tmp`;
            await fs.writeFile(tmp, buf);
            await fs.rename(tmp, file);
            await fs.writeFile(file + META_SUFFIX, JSON.stringify({ contentType: options?.contentType ?? "application/octet-stream", size: buf.length }));
            return { data: { path: objectPath, id: objectPath, fullPath: `${bucket}/${objectPath}` }, error: null };
          } catch (err) {
            return { data: null, error: fail((err as Error).message) };
          }
        },

        async download(objectPath: string) {
          try {
            const file = safeJoin(bucket, objectPath);
            const buf = await fs.readFile(file);
            const meta = await readMeta(file);
            return { data: new Blob([new Uint8Array(buf)], { type: meta?.contentType }), error: null };
          } catch {
            return { data: null, error: fail("Object not found", "404") };
          }
        },

        async createSignedUrl(objectPath: string, expiresInSeconds: number) {
          try {
            safeJoin(bucket, objectPath);
            const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresInSeconds));
            const token = signStorageToken(bucket, objectPath, exp);
            const signedUrl = `${siteBase()}/api/storage/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&token=${token}`;
            return { data: { signedUrl }, error: null };
          } catch (err) {
            return { data: null, error: fail((err as Error).message) };
          }
        },

        getPublicUrl(objectPath: string) {
          return {
            data: { publicUrl: `${siteBase()}/api/storage/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}` },
          };
        },

        async remove(paths: string[]) {
          try {
            for (const p of paths) {
              const file = safeJoin(bucket, p);
              await fs.rm(file, { force: true });
              await fs.rm(file + META_SUFFIX, { force: true });
            }
            return { data: paths.map((name) => ({ name })), error: null };
          } catch (err) {
            return { data: null, error: fail((err as Error).message) };
          }
        },

        async list(prefix = "") {
          try {
            const dir = prefix ? safeJoin(bucket, prefix) : path.join(storageRoot(), bucket);
            const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
            return { data: entries.filter((e) => !e.name.endsWith(META_SUFFIX)).map((e) => ({ name: e.name, id: e.isFile() ? e.name : null })), error: null };
          } catch (err) {
            return { data: null, error: fail((err as Error).message) };
          }
        },
      };
    },

    async listBuckets() {
      try {
        const entries = await fs.readdir(storageRoot(), { withFileTypes: true }).catch(() => []);
        const pub = publicBuckets();
        return { data: entries.filter((e) => e.isDirectory()).map((e) => ({ id: e.name, name: e.name, public: pub.includes(e.name) })), error: null };
      } catch (err) {
        return { data: null, error: fail((err as Error).message) };
      }
    },

    async createBucket(id: string, _options?: { public?: boolean; fileSizeLimit?: number | string; allowedMimeTypes?: string[] }) {
      try {
        if (!BUCKET_RE.test(id)) return { data: null, error: fail("Invalid bucket name") };
        await fs.mkdir(path.join(storageRoot(), id), { recursive: true });
        return { data: { name: id }, error: null };
      } catch (err) {
        return { data: null, error: fail((err as Error).message) };
      }
    },

    async updateBucket(_id: string, _options?: unknown) {
      return { data: { message: "Successfully updated" }, error: null };
    },

    async getBucket(id: string) {
      const ok = await fs.stat(path.join(storageRoot(), id)).then((s) => s.isDirectory(), () => false);
      return ok ? { data: { id, name: id, public: publicBuckets().includes(id) }, error: null } : { data: null, error: fail("Bucket not found", "404") };
    },
  };
}
