import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { verifyCronSecret } from "@/lib/cron-auth";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createStorageAdapterFromEnv,
  resetStorageServiceCache,
  wrapStorageAdapter,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * TEMPORARY one-shot Contabo Object Storage verification.
 * Auth: CRON_SECRET bearer OR admin session.
 * Never returns credentials. Never accepts client-supplied storage paths.
 * Remove after production Contabo verification completes.
 */
export async function POST(request: NextRequest) {
  const cron = verifyCronSecret(request);
  if (!cron.ok) {
    const auth = await requireAdminApiAuth({ lite: true });
    if ("error" in auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const provider = (process.env.STORAGE_PROVIDER ?? "").trim().toLowerCase();
  const envPresence = {
    STORAGE_PROVIDER: Boolean(process.env.STORAGE_PROVIDER?.trim()),
    CONTABO_S3_ENDPOINT: Boolean(process.env.CONTABO_S3_ENDPOINT?.trim()),
    CONTABO_S3_REGION: Boolean(process.env.CONTABO_S3_REGION?.trim()),
    CONTABO_S3_BUCKET: Boolean(process.env.CONTABO_S3_BUCKET?.trim()),
    CONTABO_S3_ACCESS_KEY: Boolean(process.env.CONTABO_S3_ACCESS_KEY?.trim()),
    CONTABO_S3_SECRET_KEY: Boolean(process.env.CONTABO_S3_SECRET_KEY?.trim()),
  };

  if (provider !== "contabo-s3") {
    return NextResponse.json(
      {
        ok: false,
        step: "env",
        error: "STORAGE_PROVIDER is not contabo-s3 (value not returned).",
        envPresence,
      },
      { status: 500 },
    );
  }

  for (const [key, present] of Object.entries(envPresence)) {
    if (!present) {
      return NextResponse.json(
        { ok: false, step: "env", error: `Missing required env: ${key}`, envPresence },
        { status: 500 },
      );
    }
  }

  let schema: {
    sales_pages: boolean;
    sales_page_assets: boolean;
    sales_page_imports: boolean;
    error?: string;
  } = {
    sales_pages: false,
    sales_page_assets: false,
    sales_page_imports: false,
  };
  try {
    await bootstrapRuntimeSecrets();
    const session = createClient();
    const admin = await createAdminClientAsync(session);
    const checks = await Promise.all(
      (["sales_pages", "sales_page_assets", "sales_page_imports"] as const).map(async (table) => {
        const { error } = await admin.from(table).select("id").limit(1);
        const missing = Boolean(
          error?.message?.match(/does not exist|Could not find the table|schema cache/i),
        );
        return [table, !missing] as const;
      }),
    );
    schema = {
      sales_pages: checks.find((c) => c[0] === "sales_pages")?.[1] ?? false,
      sales_page_assets: checks.find((c) => c[0] === "sales_page_assets")?.[1] ?? false,
      sales_page_imports: checks.find((c) => c[0] === "sales_page_imports")?.[1] ?? false,
    };
  } catch (err) {
    schema.error = err instanceof Error ? err.message : "schema_check_failed";
  }

  const id = randomUUID();
  const path = `verification/contabo-production-test-${id}.txt`;
  const payload = Buffer.from(`digitalskillx-contabo-prod-verify-${id}`, "utf8");

  resetStorageServiceCache();
  let storage;
  try {
    storage = wrapStorageAdapter(createStorageAdapterFromEnv());
  } catch (err) {
    const message = err instanceof Error ? err.message : "adapter_init_failed";
    return NextResponse.json(
      {
        ok: false,
        step: "adapter_init",
        error: message.replace(/[A-Za-z0-9/+]{24,}/g, "[REDACTED]"),
        envPresence,
        schema,
      },
      { status: 500 },
    );
  }

  if (storage.provider !== "contabo-s3") {
    return NextResponse.json(
      {
        ok: false,
        step: "adapter_init",
        error: `Unexpected provider: ${storage.provider}`,
        envPresence,
        schema,
      },
      { status: 500 },
    );
  }

  const steps: Record<string, "PASS" | "FAIL" | "SKIPPED"> = {
    upload: "SKIPPED",
    exists_after_upload: "SKIPPED",
    metadata: "SKIPPED",
    download: "SKIPPED",
    content_match: "SKIPPED",
    delete: "SKIPPED",
    exists_after_delete: "SKIPPED",
  };

  try {
    await storage.upload({
      path,
      body: payload,
      contentType: "text/plain",
      isPublic: false,
    });
    steps.upload = "PASS";

    steps.exists_after_upload = (await storage.exists(path)) ? "PASS" : "FAIL";
    if (steps.exists_after_upload === "FAIL") throw new Error("Object missing after upload.");

    const meta = await storage.getMetadata(path);
    steps.metadata = meta && meta.size === payload.length ? "PASS" : "FAIL";
    if (steps.metadata === "FAIL") throw new Error("Metadata mismatch after upload.");

    const downloaded = await storage.download(path);
    steps.download = "PASS";
    steps.content_match = Buffer.compare(downloaded, payload) === 0 ? "PASS" : "FAIL";
    if (steps.content_match === "FAIL") throw new Error("Downloaded content did not match upload.");

    await storage.delete(path);
    steps.delete = "PASS";
    steps.exists_after_delete = (await storage.exists(path)) ? "FAIL" : "PASS";
    if (steps.exists_after_delete === "FAIL") throw new Error("Object still exists after delete.");

    return NextResponse.json({
      ok: true,
      provider: storage.provider,
      namespacePrefix: "verification/contabo-production-test-",
      objectLeftBehind: false,
      steps,
      envPresence,
      schema,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    try {
      if (await storage.exists(path)) await storage.delete(path);
    } catch {
      // best-effort cleanup
    }

    const message = err instanceof Error ? err.message : "contabo_verify_failed";
    return NextResponse.json(
      {
        ok: false,
        provider: storage.provider,
        namespacePrefix: "verification/contabo-production-test-",
        steps,
        error: message.replace(/[A-Za-z0-9/+]{24,}/g, "[REDACTED]"),
        envPresence,
        schema,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST with admin or CRON auth." },
    { status: 405 },
  );
}
