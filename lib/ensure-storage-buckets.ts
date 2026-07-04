import "server-only";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";

const REQUIRED_BUCKETS = [
  { id: "public-assets", public: true },
  { id: "private-files", public: false },
] as const;

let ensurePromise: Promise<void> | null = null;

async function ensureStorageBucketsInner() {
  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();
  const { data: existing, error: listError } = await admin.storage.listBuckets();

  if (listError) {
    throw new Error(`Could not list storage buckets: ${listError.message}`);
  }

  const existingIds = new Set((existing ?? []).map((bucket) => bucket.id));

  for (const bucket of REQUIRED_BUCKETS) {
    if (existingIds.has(bucket.id)) continue;

    const { error } = await admin.storage.createBucket(bucket.id, {
      public: bucket.public,
    });

    if (error && !/already exists/i.test(error.message)) {
      throw new Error(
        `Storage bucket "${bucket.id}" is missing and could not be created: ${error.message}. Run supabase/migrations/0004_storage.sql in the Supabase SQL Editor.`,
      );
    }
  }
}

/** Creates public-assets and private-files buckets when missing (production Supabase setup). */
export async function ensureStorageBuckets() {
  ensurePromise ??= ensureStorageBucketsInner().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

export async function listStorageBucketIds() {
  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw new Error(error.message);
  return (data ?? []).map((bucket) => bucket.id);
}
