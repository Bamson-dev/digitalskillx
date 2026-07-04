#!/usr/bin/env node
/**
 * Verifies admin course creation via service role (same path as getAdminSupabase).
 * Loads secrets from .env.local — no passwords logged.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

function loadEnv() {
  if (!existsSync(envPath)) throw new Error(".env.local missing");
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceRole || !anon) {
    throw new Error("Missing Supabase env in .env.local");
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: adminProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (profileError || !adminProfile) {
    throw new Error(profileError?.message ?? "No admin profile in database");
  }

  console.log("Admin profile:", adminProfile.email);

  const title = `Automated test course ${Date.now()}`;
  const { data: created, error: insertError } = await admin
    .from("courses")
    .insert({ title, created_by: adminProfile.id })
    .select("id, title")
    .single();

  if (insertError || !created) {
    throw new Error(insertError?.message ?? "Service role insert failed");
  }

  console.log("PASS: service role created course", created.id, created.title);

  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: rlsError } = await anonClient
    .from("courses")
    .insert({ title: "RLS should block", created_by: adminProfile.id });

  if (!rlsError) {
    await admin.from("courses").delete().eq("title", "RLS should block");
    throw new Error("Expected RLS to block anon insert");
  }

  console.log("PASS: anon insert blocked by RLS (", rlsError.message, ")");

  const { error: deleteError } = await admin.from("courses").delete().eq("id", created.id);
  if (deleteError) throw new Error(deleteError.message);
  console.log("PASS: cleaned up test course");
  console.log("=== ALL PASSED ===");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
