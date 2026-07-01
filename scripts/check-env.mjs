#!/usr/bin/env node
/**
 * Validates that expected env vars are present in .env.local (or process.env).
 * Run: npm run check-env
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

const PLACEHOLDERS = [
  "YOUR-PROJECT-REF",
  "your-anon-publishable-key",
  "your-service-role-secret-key",
  "your-zeptomail-smtp-password",
  "your-youtube-data-api-key",
  "sk-ant-your-key",
  "generate-a-long-random-string",
];

function isRealValue(val) {
  if (!val) return false;
  return !PLACEHOLDERS.some((p) => val.includes(p));
}

function loadEnvFile(path) {
  const vars = {};
  if (!existsSync(path)) return vars;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const fileVars = loadEnvFile(envPath);
const get = (key) => process.env[key] ?? fileVars[key] ?? "";

const required = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL (auth + DB)" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase anon key (auth + DB)" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role (admin actions)" },
];

const optional = [
  { key: "NEXT_PUBLIC_SITE_URL", label: "Public site URL", fallback: "https://digitalskillx.com" },
  { key: "ZEPTOMAIL_SMTP_HOST", label: "ZeptoMail SMTP host", fallback: "smtp.zeptomail.com" },
  { key: "ZEPTOMAIL_SMTP_PORT", label: "ZeptoMail SMTP port", fallback: "587" },
  { key: "ZEPTOMAIL_SMTP_USER", label: "ZeptoMail SMTP user" },
  { key: "ZEPTOMAIL_SMTP_PASSWORD", label: "ZeptoMail SMTP password" },
  { key: "ZEPTOMAIL_FROM_EMAIL", label: "Email sender address", fallback: "courses@digitalskillx.com" },
  { key: "ZEPTOMAIL_FROM_NAME", label: "Email sender name", fallback: "DigitalSkillX" },
  { key: "YOUTUBE_API_KEY", label: "YouTube import" },
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek AI assistant" },
  { key: "DEEPSEEK_MODEL", label: "DeepSeek model", fallback: "deepseek-chat" },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic AI assistant (fallback)" },
  { key: "CRON_SECRET", label: "Vercel cron auth" },
];

console.log("\nDigitalSkillX — environment check\n");
console.log(`File: ${existsSync(envPath) ? envPath : "(missing — copy .env.example to .env.local)"}\n`);

let failed = false;

console.log("Required:");
for (const { key, label } of required) {
  const ok = isRealValue(get(key));
  if (!ok) failed = true;
  console.log(`  ${ok ? "✓" : "✗"} ${key} — ${label}`);
}

console.log("\nOptional:");
for (const { key, label, fallback } of optional) {
  const val = get(key);
  const ok = isRealValue(val);
  const note = ok ? "set" : fallback ? `missing (default: ${fallback})` : "missing";
  console.log(`  ${ok ? "✓" : "·"} ${key} — ${label} [${note}]`);
}

const aiOk = isRealValue(get("DEEPSEEK_API_KEY")) || isRealValue(get("ANTHROPIC_API_KEY"));
console.log(`\nAI assistant: ${aiOk ? "configured" : "not configured (set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY)"}`);

console.log(failed ? "\n❌ Missing required variables.\n" : "\n✅ Required variables present.\n");
process.exit(failed ? 1 : 0);
