import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createStorageAdapterFromEnv } from "../../lib/storage/index.ts";

const CLEAR = ["STORAGE_PROVIDER", "CONTABO_S3_ENDPOINT", "CONTABO_S3_BUCKET", "CONTABO_S3_ACCESS_KEY", "CONTABO_S3_SECRET_KEY", "CONTABO_STORAGE_ROOT", "STORAGE_FS_ROOT", "STORAGE_LOCAL_ROOT", "STORAGE_ALLOW_EPHEMERAL"];

function setup(nodeEnv, extra = {}) {
  for (const key of CLEAR) delete process.env[key];
  process.env.NODE_ENV = nodeEnv;
  Object.assign(process.env, extra);
  return createStorageAdapterFromEnv();
}

const input = { path: "guard-test/file.txt", body: Buffer.from("x"), contentType: "text/plain" };

function blockedMessage(fn) {
  try {
    fn();
  } catch (error) {
    return /Storage write blocked/.test(String(error && error.message));
  }
  return false;
}

async function writeIsBlocked(adapter) {
  for (const op of ["upload", "replace"]) {
    try {
      await adapter[op](input);
    } catch (error) {
      if (/Storage write blocked/.test(String(error && error.message))) continue;
    }
    return false;
  }
  return blockedMessage(() => adapter.copy("a", "b")) && blockedMessage(() => adapter.move("a", "b"));
}

async function writeIsNotBlocked(adapter) {
  for (const op of ["upload", "replace"]) {
    try {
      await adapter[op](input);
    } catch (error) {
      if (/Storage write blocked/.test(String(error && error.message))) return false;
    }
  }
  return true;
}

const production = setup("production");
assert.equal(await writeIsBlocked(production), true, "production without persistent root must block writes");
assert.equal(typeof production.download, "function", "reads stay available");
assert.equal(typeof production.exists, "function", "exists stays available");
assert.equal(typeof production.delete, "function", "delete stays available");

const root = path.join(os.tmpdir(), "dsx-guard-" + process.pid);
const persistent = setup("production", { STORAGE_LOCAL_ROOT: root });
assert.equal(await writeIsNotBlocked(persistent), true, "explicit STORAGE_LOCAL_ROOT allows writes");

const optIn = setup("production", { STORAGE_ALLOW_EPHEMERAL: "1" });
assert.equal(await writeIsNotBlocked(optIn), true, "STORAGE_ALLOW_EPHEMERAL=1 allows writes");

const dev = setup("development");
assert.equal(await writeIsNotBlocked(dev), true, "development keeps local writes");

console.log("storage ephemeral guard checks passed");
