import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStorageAdapterFromEnv, resetStorageServiceCache, wrapStorageAdapter } from "../../lib/storage/index.ts";

const CLEAR = ["STORAGE_PROVIDER", "CONTABO_S3_ENDPOINT", "CONTABO_S3_BUCKET", "CONTABO_S3_ACCESS_KEY", "CONTABO_S3_SECRET_KEY", "CONTABO_STORAGE_ROOT", "STORAGE_FS_ROOT", "STORAGE_LOCAL_ROOT", "STORAGE_ALLOW_EPHEMERAL"];
const BLOCKED = /Storage write blocked/;

// The default local root is <cwd>/.data/storage, so a temp cwd gives each run a real, isolated directory.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "dsx-guard-"));
process.chdir(sandbox);
const storageDir = path.join(sandbox, ".data", "storage");

function service(nodeEnv, extra = {}) {
  for (const key of CLEAR) delete process.env[key];
  process.env.NODE_ENV = nodeEnv;
  Object.assign(process.env, extra);
  return wrapStorageAdapter(createStorageAdapterFromEnv());
}

async function rejectsBlocked(fn, label) {
  await assert.rejects(async () => fn(), BLOCKED, label + " must be blocked");
}

const rel = "guard-test/file.txt";
const abs = path.join(storageDir, rel);
const upload = (body) => ({ path: rel, body: Buffer.from(body), contentType: "text/plain" });
const read = () => fs.readFileSync(abs, "utf8");

// Seed a real file through an unguarded (development) service.
const seed = service("development");
await seed.upload(upload("original"));
await seed.upload({ path: "guard-test/other.txt", body: Buffer.from("other"), contentType: "text/plain" });
assert.equal(read(), "original", "seed file exists on disk");

// Production without a persistent root: every write path fails and nothing changes.
const prod = service("production");
await rejectsBlocked(() => prod.replace(upload("replacement")), "replace of an existing file");
assert.equal(fs.existsSync(abs), true, "replace must not delete the original file");
assert.equal(read(), "original", "original contents unchanged after blocked replace");
await rejectsBlocked(() => prod.upload(upload("overwrite")), "upload over an existing file");
assert.equal(read(), "original", "original contents unchanged after blocked upload");
await rejectsBlocked(() => prod.upload({ path: "guard-test/new.txt", body: Buffer.from("n"), contentType: "text/plain" }), "upload of a new file");
assert.equal(fs.existsSync(path.join(storageDir, "guard-test/new.txt")), false, "blocked upload must not create a file");
await rejectsBlocked(() => prod.copy(rel, "guard-test/copy.txt"), "copy");
assert.equal(fs.existsSync(path.join(storageDir, "guard-test/copy.txt")), false, "blocked copy must not create a file");
await rejectsBlocked(() => prod.move(rel, "guard-test/moved.txt"), "move");
assert.equal(fs.existsSync(path.join(storageDir, "guard-test/moved.txt")), false, "blocked move must not create a file");
assert.equal(read(), "original", "source file intact after blocked copy and move");

// Reads stay available. Delete stays available by design, so stale local files can be cleaned up.
assert.equal(await prod.exists(rel), true, "exists works");
assert.equal((await prod.download(rel)).toString("utf8"), "original", "download works");
await prod.delete("guard-test/other.txt");
assert.equal(fs.existsSync(path.join(storageDir, "guard-test/other.txt")), false, "delete is allowed");

// Opt-outs: an explicit root, STORAGE_ALLOW_EPHEMERAL=1 and non-production keep writes working, including replace.
const roots = [
  ["explicit root", service("production", { STORAGE_LOCAL_ROOT: path.join(sandbox, "explicit") }), path.join(sandbox, "explicit", rel)],
  ["opt-in", service("production", { STORAGE_ALLOW_EPHEMERAL: "1" }), abs],
  ["development", service("development"), abs],
];
for (const [label, svc, file] of roots) {
  await svc.upload(upload("first-" + label));
  await svc.replace(upload("second-" + label));
  assert.equal(fs.readFileSync(file, "utf8"), "second-" + label, label + " allows upload and replace");
}

// assertWritable lets callers stop before expensive work.
assert.throws(() => service("production").assertWritable(), BLOCKED, "assertWritable throws when writes are blocked");
service("development").assertWritable();
service("production", { STORAGE_ALLOW_EPHEMERAL: "1" }).assertWritable();

// Content factory artwork must not call the paid image API when the result cannot be stored.
for (const key of CLEAR) delete process.env[key];
process.env.NODE_ENV = "production";
process.env.OPENAI_API_KEY = "test-key-not-real";
resetStorageServiceCache();
const realFetch = globalThis.fetch;
let imageCalls = 0;
globalThis.fetch = async () => {
  imageCalls += 1;
  throw new Error("network disabled in test");
};
try {
  const { generateAndStoreLearningPathArtwork } = await import("../../lib/content-factory/artwork.ts");
  const result = await generateAndStoreLearningPathArtwork({ learningPathId: "guard-test", title: "Guard test", category: "test" });
  assert.equal(result.status, "failed", "artwork reports failure");
  assert.match(String(result.error), BLOCKED, "artwork failure names the storage block");
  assert.equal(imageCalls, 0, "no image API call when storage is blocked");
} finally {
  globalThis.fetch = realFetch;
  delete process.env.OPENAI_API_KEY;
  resetStorageServiceCache();
}

fs.rmSync(sandbox, { recursive: true, force: true });
console.log("storage ephemeral guard checks passed");
