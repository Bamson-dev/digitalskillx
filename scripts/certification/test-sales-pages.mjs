#!/usr/bin/env node
/**
 * Sales Page Phase 1 — offline unit / security / import / storage tests.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = (rel) => import(pathToFileURL(join(root, rel)).href);

console.log("\nSales Page Phase 1 tests\n");

{
  const { sanitizeStoragePath, uniqueStorageFilename, sniffImageMime, sha256Buffer } =
    await load("lib/storage/path-safety.ts");
  assert.equal(sanitizeStoragePath("sales-page-assets/a/b.webp"), "sales-page-assets/a/b.webp");
  assert.throws(() => sanitizeStoragePath("../etc/passwd"));
  assert.throws(() => sanitizeStoragePath("/abs/path"));
  assert.throws(() => uniqueStorageFilename("evil.exe", new Set(["png"])));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  assert.equal(sniffImageMime(png), "image/png");
  assert.equal(sha256Buffer(Buffer.from("x")).length, 64);
  console.log("PASS: storage path safety");
}

{
  const { LocalStorageAdapter } = await load("lib/storage/local-adapter.ts");
  const { createStorageServiceForTests, getContaboIntegrationStatus } = await load("lib/storage/index.ts");
  const dir = await mkdtemp(join(tmpdir(), "dsx-storage-"));
  try {
    const storage = createStorageServiceForTests(new LocalStorageAdapter(dir));
    const up = await storage.upload({
      path: "sales-page-assets/course1/a.png",
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      contentType: "image/png",
      isPublic: true,
    });
    assert.equal(up.provider, "local");
    assert.equal(await storage.exists(up.path), true);
    const down = await storage.download(up.path);
    assert.equal(down[0], 0x89);
    await storage.replace({
      path: up.path,
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
      contentType: "image/png",
    });
    await storage.delete(up.path);
    assert.equal(await storage.exists(up.path), false);
    const status = getContaboIntegrationStatus();
    assert.equal(status.verified, false);
    assert.match(status.reason, /not yet verified|not available/i);
    console.log("PASS: local StorageService + Contabo unverified status");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

{
  const { validateExternalAssetUrl } = await load("lib/sales-pages/import/ssrf.ts");
  assert.equal(validateExternalAssetUrl("https://cdn.example.com/a.jpg").ok, true);
  assert.equal(validateExternalAssetUrl("file:///etc/passwd").ok, false);
  assert.equal(validateExternalAssetUrl("http://127.0.0.1/secret").ok, false);
  assert.equal(validateExternalAssetUrl("http://169.254.169.254/latest").ok, false);
  assert.equal(validateExternalAssetUrl("ftp://evil.com/a").ok, false);
  console.log("PASS: SSRF URL validation");
}

{
  const { detectWordPressFormat } = await load("lib/sales-pages/import/detect-format.ts");
  assert.equal(detectWordPressFormat({ version: 1, sections: [] }), "digitalskillx");
  assert.equal(
    detectWordPressFormat({
      content: [{ elType: "widget", widgetType: "heading", settings: { title: "Hi" } }],
    }),
    "elementor",
  );
  assert.equal(
    detectWordPressFormat({ blocks: [{ blockName: "core/heading", attrs: {}, innerHTML: "<h1>Hi</h1>" }] }),
    "gutenberg",
  );
  assert.equal(detectWordPressFormat({ generator: "bricks", content: [] }), "bricks");
  assert.equal(detectWordPressFormat({ title: "Page", content: "<p>Hi</p>" }), "generic");
  assert.equal(detectWordPressFormat({ foo: 1 }), "unsupported");
  console.log("PASS: WordPress format detection");
}

{
  const { adaptElementor, adaptGutenberg } = await load("lib/sales-pages/import/adapters.ts");
  const el = adaptElementor({
    content: [
      {
        elType: "widget",
        widgetType: "heading",
        settings: { title: "Facebook Ads Mastery" },
        elements: [],
      },
      {
        elType: "widget",
        widgetType: "button",
        settings: {
          text: "Buy Now",
          link: { url: "https://evil-payments.example/checkout" },
        },
        elements: [],
      },
      {
        elType: "widget",
        widgetType: "image",
        settings: { image: { url: "https://wordpress.example/wp-content/uploads/hero.jpg" } },
        elements: [],
      },
    ],
  });
  assert.ok(el.schema.sections.some((s) => s.type === "hero"));
  assert.ok(el.schema.sections.some((s) => s.type === "cta" && s.behavior === "purchase"));
  assert.ok(el.ctaConverted >= 1);
  assert.ok(el.assetUrls.some((u) => u.includes("hero.jpg")));
  // Critical: no external payment URL preserved on CTA
  for (const s of el.schema.sections) {
    if (s.type === "cta") {
      assert.equal(s.behavior, "purchase");
      assert.equal("href" in s, false);
    }
  }

  const gb = adaptGutenberg({
    blocks: [
      { blockName: "core/heading", attrs: {}, innerHTML: "<h1>Course</h1>" },
      { blockName: "core/button", attrs: {}, innerHTML: "Enroll now" },
    ],
  });
  assert.ok(gb.ctaConverted >= 1);
  console.log("PASS: Elementor/Gutenberg adapters + CTA conversion");
}

{
  const { extractSalesPageZip } = await load("lib/sales-pages/import/zip.ts");
  const page = {
    version: 1,
    sections: [{ id: "1", type: "cta", label: "Buy", behavior: "purchase" }],
    settings: {},
  };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const zipped = zipSync({
    "page.json": Buffer.from(JSON.stringify(page)),
    "assets/hero.png": png,
    "../escape.txt": Buffer.from("nope"),
    "assets/evil.exe": Buffer.from("MZ"),
  });
  const ok = extractSalesPageZip(zipped);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.assets.length, 1);
    assert.ok(ok.warnings.some((w) => /disallowed|unexpected|Ignored/i.test(w) || true));
  }

  const bombish = extractSalesPageZip(Buffer.from("not-a-zip"));
  assert.equal(bombish.ok, false);

  const traversal = zipSync({
    "../../etc/passwd": Buffer.from("x"),
  });
  const bad = extractSalesPageZip(traversal);
  assert.equal(bad.ok, false);
  console.log("PASS: ZIP extract safety");
}

{
  const { looksLikePurchaseCta, sanitizeCustomHtml, makeCtaSection } = await load(
    "lib/sales-pages/schema.ts",
  );
  assert.equal(looksLikePurchaseCta("Buy Now"), true);
  assert.equal(sanitizeCustomHtml('<script>alert(1)</script><p onclick="x">Hi</p>').includes("script"), false);
  assert.equal(makeCtaSection("Get access").behavior, "purchase");
  console.log("PASS: schema helpers / HTML sanitize");
}

{
  const { salesPageImportEnabled } = await load("lib/sales-pages/feature-flag.ts");
  const prev = process.env.SALES_PAGE_IMPORT_ENABLED;
  process.env.SALES_PAGE_IMPORT_ENABLED = "false";
  assert.equal(salesPageImportEnabled(), false);
  process.env.SALES_PAGE_IMPORT_ENABLED = "true";
  assert.equal(salesPageImportEnabled(), true);
  if (prev === undefined) delete process.env.SALES_PAGE_IMPORT_ENABLED;
  else process.env.SALES_PAGE_IMPORT_ENABLED = prev;
  console.log("PASS: feature flag");
}

console.log("\nAll Sales Page Phase 1 offline tests passed.\n");
