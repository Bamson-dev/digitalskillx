#!/usr/bin/env node
/**
 * PostgreSQL data layer, auth and storage, run against a real PostgreSQL database.
 * Needs TEST_DATABASE_URL (a throwaway database with supabase/migrations applied and the
 * auth/storage schemas present). Skips with exit code 0 when it is not set.
 * Run: TEST_DATABASE_URL=postgres://... npm run test:postgres
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("SKIP test-postgres-data-layer: TEST_DATABASE_URL is not set");
  process.exit(0);
}
process.env.DATABASE_URL = url;
process.env.AUTH_JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.STORAGE_FS_ROOT = mkdtempSync(join(tmpdir(), "dsx-storage-"));
process.env.NEXT_PUBLIC_SITE_URL = "https://test.example";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = (rel) => pathToFileURL(join(root, rel)).href;
const { createServiceClient, createRequestClient, createAnonDbClient } = await import(ts("lib/db/client.ts"));
const { closePool, getPool } = await import(ts("lib/db/pool.ts"));
const { totpCode } = await import(ts("lib/db/auth.ts"));
const { verifyAccessToken, SESSION_COOKIE_NAME } = await import(ts("lib/db/jwt.ts"));
const { parseLogicTree } = await import(ts("lib/db/filters.ts"));
const { parseSelect } = await import(ts("lib/db/builder.ts"));

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`ok  ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n`, err);
    process.exitCode = 1;
  }
};

function jar() {
  const store = new Map();
  return {
    store,
    getAll: () => [...store.entries()].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => {
      for (const c of cookies) {
        if (c.value === "") store.delete(c.name);
        else store.set(c.name, c.value);
      }
    },
  };
}

const admin = createServiceClient();
const tag = `t${Date.now()}`;
const emailA = `a.${tag}@example.com`;
const emailB = `b.${tag}@example.com`;

await test("filter parsing: or(), nested and(), in lists, quoted values", () => {
  const tree = parseLogicTree('a.eq.1,b.in.(x,"y,z"),and(c.gt.2,d.is.null)');
  assert.equal(tree.kind, "or");
  assert.equal(tree.children.length, 3);
  assert.deepEqual(tree.children[1].value, ["x", "y,z"]);
  assert.equal(tree.children[2].kind, "and");
});

await test("select parsing: aliases, embeds, hints, nesting", () => {
  const items = parseSelect("id, title, course:courses(id, title), modules!inner(id, lessons(*))");
  assert.equal(items.length, 4);
  assert.equal(items[2].alias, "course");
  assert.equal(items[2].target, "courses");
  assert.equal(items[3].inner, true);
  assert.equal(items[3].items[1].type, "embed");
});

let userA;
let userB;

await test("auth.admin.createUser stores a bcrypt hash and rejects duplicates", async () => {
  const a = await admin.auth.admin.createUser({ email: emailA, password: "Passw0rd!A", email_confirm: true, user_metadata: { full_name: "Alice Tester" } });
  assert.equal(a.error, null);
  userA = a.data.user;
  assert.equal(userA.email, emailA);
  assert.equal(userA.user_metadata.full_name, "Alice Tester");
  const b = await admin.auth.admin.createUser({ email: emailB, password: "Passw0rd!B", email_confirm: true });
  userB = b.data.user;
  const dup = await admin.auth.admin.createUser({ email: emailA.toUpperCase(), password: "x", email_confirm: true });
  assert.match(dup.error.message, /already been registered/);
  const { rows } = await getPool().query("select encrypted_password from auth.users where id = $1", [userA.id]);
  assert.match(rows[0].encrypted_password, /^\$2[aby]\$10\$/);
});

await test("signInWithPassword: success, wrong password, unknown user, unconfirmed, banned", async () => {
  const c = jar();
  const client = createRequestClient(c);
  const ok = await client.auth.signInWithPassword({ email: emailA.toUpperCase(), password: "Passw0rd!A" });
  assert.equal(ok.error, null);
  assert.ok(ok.data.session.access_token);
  assert.ok(c.store.has(SESSION_COOKIE_NAME), "session cookie written");
  const bad = await client.auth.signInWithPassword({ email: emailA, password: "nope" });
  assert.equal(bad.error.message, "Invalid login credentials");
  const unknown = await client.auth.signInWithPassword({ email: `nobody.${tag}@example.com`, password: "x" });
  assert.equal(unknown.error.message, "Invalid login credentials");
  const unconf = await admin.auth.admin.createUser({ email: `u.${tag}@example.com`, password: "Passw0rd!U" });
  const r = await client.auth.signInWithPassword({ email: `u.${tag}@example.com`, password: "Passw0rd!U" });
  assert.equal(r.error.message, "Email not confirmed");
  await admin.auth.admin.updateUserById(unconf.data.user.id, { email_confirm: true, ban_duration: "100h" });
  const banned = await client.auth.signInWithPassword({ email: `u.${tag}@example.com`, password: "Passw0rd!U" });
  assert.equal(banned.error.message, "User is banned");
});

await test("getUser needs a live session; signOut revokes it", async () => {
  const c = jar();
  const client = createRequestClient(c);
  await client.auth.signInWithPassword({ email: emailA, password: "Passw0rd!A" });
  const me = await client.auth.getUser();
  assert.equal(me.data.user.id, userA.id);
  const token = c.store.get(SESSION_COOKIE_NAME);
  const claims = await verifyAccessToken(token);
  assert.equal(claims.sub, userA.id);
  await client.auth.signOut();
  assert.equal(c.store.has(SESSION_COOKIE_NAME), false);
  // The old token must be dead even if a browser replays it.
  const replay = jar();
  replay.store.set(SESSION_COOKIE_NAME, token);
  const again = await createRequestClient(replay).auth.getUser();
  assert.equal(again.data.user, null);
  const tampered = jar();
  tampered.store.set(SESSION_COOKIE_NAME, token.slice(0, -3) + "abc");
  assert.equal((await createRequestClient(tampered).auth.getUser()).data.user, null);
});

await test("password recovery link: generateLink + verifyOtp starts a session, link is single use", async () => {
  const link = await admin.auth.admin.generateLink({ type: "recovery", email: emailB, options: { redirectTo: "https://test.example/auth/callback" } });
  assert.equal(link.error, null);
  const hashed = link.data.properties.hashed_token;
  assert.match(link.data.properties.action_link, /token_hash=/);
  const c = jar();
  const client = createRequestClient(c);
  const v = await client.auth.verifyOtp({ token_hash: hashed, type: "recovery" });
  assert.equal(v.error, null);
  const upd = await client.auth.updateUser({ password: "NewPassw0rd!B" });
  assert.equal(upd.error, null);
  const second = await createRequestClient(jar()).auth.verifyOtp({ token_hash: hashed, type: "recovery" });
  assert.ok(second.error, "token already used");
  const old = await createRequestClient(jar()).auth.signInWithPassword({ email: emailB, password: "Passw0rd!B" });
  assert.ok(old.error, "old password rejected");
  const fresh = await createRequestClient(jar()).auth.signInWithPassword({ email: emailB, password: "NewPassw0rd!B" });
  assert.equal(fresh.error, null);
  const missing = await admin.auth.admin.generateLink({ type: "recovery", email: `ghost.${tag}@example.com` });
  assert.match(missing.error.message, /user not found/i);
});

await test("existing GoTrue bcrypt hashes keep working", async () => {
  const bcrypt = (await import("bcryptjs")).default;
  const legacy = bcrypt.hashSync("LegacyPass1", 10).replace(/^\$2b\$/, "$2a$");
  await getPool().query("update auth.users set encrypted_password = $1 where id = $2", [legacy, userA.id]);
  const r = await createRequestClient(jar()).auth.signInWithPassword({ email: emailA, password: "LegacyPass1" });
  assert.equal(r.error, null);
  await getPool().query("update auth.users set encrypted_password = $1 where id = $2", [bcrypt.hashSync("Passw0rd!A", 10), userA.id]);
});

await test("MFA: enroll, challenge, verify with a real TOTP code, aal2 token", async () => {
  const c = jar();
  const client = createRequestClient(c);
  await client.auth.signInWithPassword({ email: emailA, password: "Passw0rd!A" });
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Test" });
  assert.equal(enrolled.error, null);
  assert.match(enrolled.data.totp.qr_code, /^data:image\/svg\+xml/);
  const before = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.equal(before.data.currentLevel, "aal1");
  const ch = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
  const wrong = await client.auth.mfa.verify({ factorId: enrolled.data.id, challengeId: ch.data.id, code: "000000" });
  assert.ok(wrong.error);
  const ch2 = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
  const good = await client.auth.mfa.verify({ factorId: enrolled.data.id, challengeId: ch2.data.id, code: totpCode(enrolled.data.totp.secret) });
  assert.equal(good.error, null);
  const after = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.equal(after.data.currentLevel, "aal2");
  const factors = await client.auth.mfa.listFactors();
  assert.equal(factors.data.totp.length, 1);
  await getPool().query("delete from auth.mfa_factors where user_id = $1", [userA.id]);
});

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

const courseIds = [];
await test("insert: single, array, returning, defaults, JSON columns", async () => {
  const one = await admin.from("courses").insert({ title: `C1 ${tag}`, description: "d", price_ngn: 5000 }).select("*").single();
  assert.equal(one.error, null);
  assert.equal(one.data.title, `C1 ${tag}`);
  assert.equal(typeof one.data.price_ngn, "number");
  assert.match(one.data.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?\+00:00$/);
  courseIds.push(one.data.id);
  const many = await admin.from("courses").insert([{ title: `C2 ${tag}`, price_ngn: 0 }, { title: `C3 ${tag}`, price_ngn: 100 }]).select("id, title");
  assert.equal(many.error, null);
  assert.equal(many.data.length, 2);
  courseIds.push(...many.data.map((r) => r.id));
  const noReturn = await admin.from("courses").insert({ title: `C4 ${tag}`, price_ngn: 0 });
  assert.equal(noReturn.error, null);
  assert.equal(noReturn.data, null);
});

await test("select: filters, order, limit, range, count", async () => {
  const all = await admin.from("courses").select("id, title", { count: "exact" }).ilike("title", `%${tag}`).order("title", { ascending: false });
  assert.equal(all.error, null);
  assert.equal(all.count, 4);
  assert.deepEqual(all.data.map((r) => r.title), [`C4 ${tag}`, `C3 ${tag}`, `C2 ${tag}`, `C1 ${tag}`]);
  const head = await admin.from("courses").select("id", { count: "exact", head: true }).ilike("title", `%${tag}`);
  assert.equal(head.count, 4);
  assert.equal(head.data, null);
  const page = await admin.from("courses").select("title").ilike("title", `%${tag}`).order("title").range(1, 2);
  assert.equal(page.data.length, 2);
  assert.equal(page.data[0].title, `C2 ${tag}`);
  const inn = await admin.from("courses").select("id").in("id", courseIds.slice(0, 2));
  assert.equal(inn.data.length, 2);
  const ambiguous = await admin.from("enrollments").select("id, student:profiles(full_name)");
  assert.match(ambiguous.error.message, /Ambiguous relationship/);
  const none = await admin.from("courses").select("id").in("id", []);
  assert.deepEqual(none.data, []);
  const or = await admin.from("courses").select("title").or(`title.eq.C1 ${tag},price_ngn.eq.100`);
  assert.equal(or.data.length, 2);
  const nul = await admin.from("courses").select("title").ilike("title", `%${tag}`).is("description", null);
  assert.ok(nul.data.length >= 1);
  const notIn = await admin.from("courses").select("title").ilike("title", `%${tag}`).not("title", "eq", `C1 ${tag}`);
  assert.equal(notIn.data.length, 3);
});

await test("single / maybeSingle error shapes", async () => {
  const none = await admin.from("courses").select("id").eq("id", "00000000-0000-0000-0000-000000000000").single();
  assert.equal(none.error.code, "PGRST116");
  const maybe = await admin.from("courses").select("id").eq("id", "00000000-0000-0000-0000-000000000000").maybeSingle();
  assert.equal(maybe.error, null);
  assert.equal(maybe.data, null);
  const many = await admin.from("courses").select("id").ilike("title", `%${tag}`).maybeSingle();
  assert.equal(many.error.code, "PGRST116");
  const bad = await admin.from("courses").select("nonexistent_col");
  assert.equal(bad.error.code, "42703");
  const missingTable = await admin.from("no_such_table").select("*");
  assert.equal(missingTable.error.code, "42P01");
});

await test("update + delete need filters, return rows, report counts", async () => {
  const noWhere = await admin.from("courses").update({ price_ngn: 1 });
  assert.equal(noWhere.error.code, "21000");
  const u = await admin.from("courses").update({ price_ngn: 7777 }).eq("id", courseIds[0]).select("id, price_ngn").single();
  assert.equal(u.data.price_ngn, 7777);
  const multi = await admin.from("courses").update({ price_ngn: 9, description: "multi" }).in("id", courseIds.slice(1, 3)).select("id");
  assert.equal(multi.data.length, 2);
  const arr = await admin.from("courses").update({ title: `C1 ${tag}` }).eq("id", courseIds[0]);
  assert.equal(arr.error, null);
  const del = await admin.from("courses").delete({ count: "exact" }).eq("title", `C4 ${tag}`);
  assert.equal(del.count, 1);
  const delNoWhere = await admin.from("courses").delete();
  assert.equal(delNoWhere.error.code, "21000");
});

await test("upsert: onConflict update, ignoreDuplicates, default primary key", async () => {
  await admin.from("profiles").upsert({ id: userA.id, email: emailA, full_name: "Alice Upserted", role: "student" }, { onConflict: "id" });
  const p = await admin.from("profiles").select("full_name").eq("id", userA.id).single();
  assert.equal(p.data.full_name, "Alice Upserted");
  const r1 = await admin.from("enrollments").upsert({ student_id: userA.id, course_id: courseIds[0] }, { onConflict: "student_id,course_id", ignoreDuplicates: true }).select("id");
  assert.equal(r1.data.length, 1);
  const r2 = await admin.from("enrollments").upsert({ student_id: userA.id, course_id: courseIds[0] }, { onConflict: "student_id,course_id", ignoreDuplicates: true }).select("id");
  assert.equal(r2.data.length, 0);
  const dupe = await admin.from("enrollments").insert({ student_id: userA.id, course_id: courseIds[0] });
  assert.equal(dupe.error.code, "23505");
});

await test("embedded selects: to-one, to-many, nested, !inner with filter", async () => {
  await admin.from("profiles").upsert({ id: userB.id, email: emailB, full_name: "Bob", role: "student" }, { onConflict: "id" });
  const mod = await admin.from("modules").insert({ course_id: courseIds[0], title: "Mod 1", position: 1 }).select("id").single();
  const lessonIns = await admin.from("lessons").insert([
    { module_id: mod.data.id, title: "L1", position: 1, lesson_type: "text" },
    { module_id: mod.data.id, title: "L2", position: 2, lesson_type: "text" },
  ]);
  assert.equal(lessonIns.error, null, lessonIns.error?.message);
  const enr = await admin.from("enrollments").select("id, enrolled_at, course:courses(id, title), student:profiles!enrollments_student_id_fkey(full_name, email)").eq("student_id", userA.id);
  assert.equal(enr.error, null, enr.error?.message);
  assert.equal(enr.data[0].course.title, `C1 ${tag}`);
  assert.equal(enr.data[0].student.full_name, "Alice Upserted");
  const tree = await admin.from("courses").select("*, modules(*, lessons(*))").eq("id", courseIds[0]).single();
  assert.equal(tree.error, null, tree.error?.message);
  assert.equal(tree.data.modules.length, 1);
  assert.equal(tree.data.modules[0].lessons.length, 2);
  const empty = await admin.from("courses").select("id, modules(id)").eq("id", courseIds[1]).single();
  assert.deepEqual(empty.data.modules, []);
  const inner = await admin.from("lessons").select("id, title, module:modules!inner(course_id)").eq("module.course_id", courseIds[0]);
  assert.equal(inner.error, null, inner.error?.message);
  assert.equal(inner.data.length, 2);
  const innerNone = await admin.from("lessons").select("id, module:modules!inner(course_id)").eq("module.course_id", courseIds[1]);
  assert.equal(innerNone.data.length, 0);
});

await test("JSON path filters and writes to jsonb columns", async () => {
  const tx = await admin.from("transactions").insert({
    student_id: userA.id, course_id: courseIds[0], amount: 5000, reference: `ref-${tag}`, status: "success",
    paystack_data: { access_email_sent_at: "2026-01-01T00:00:00Z", nested: { ok: true } },
  }).select("id, paystack_data").single();
  assert.equal(tx.error, null, tx.error?.message);
  assert.equal(tx.data.paystack_data.nested.ok, true);
  const q = await admin.from("transactions").select("id").eq("reference", `ref-${tag}`).not("paystack_data->>access_email_sent_at", "is", null);
  assert.equal(q.data.length, 1);
  const q2 = await admin.from("transactions").select("id").eq("paystack_data->nested->>ok", "true");
  assert.ok(q2.data.length >= 1);
});

await test("rpc: scalar, set-returning, missing function", async () => {
  const missing = await admin.rpc("does_not_exist", {});
  assert.equal(missing.error.code, "PGRST202");
  const r = await admin.rpc("list_course_publish_recipients");
  assert.equal(r.error, null, r.error?.message);
  assert.ok(Array.isArray(r.data));
});

await test("service connection may change profiles.role; a signed-in user may not", async () => {
  const up = await admin.from("profiles").update({ role: "admin" }).eq("id", userB.id).select("role").single();
  assert.equal(up.error, null, up.error?.message);
  assert.equal(up.data.role, "admin");
  await admin.from("profiles").update({ role: "student" }).eq("id", userB.id);
  const asUser = createRequestClient(jar());
  const signedIn = await asUser.auth.signInWithPassword({ email: emailB, password: "NewPassw0rd!B" });
  assert.equal(signedIn.error, null, signedIn.error?.message);
  const denied = await asUser.from("profiles").update({ role: "admin" }).eq("id", userB.id).select("role");
  assert.ok(denied.error || (denied.data ?? []).length === 0, "user must not escalate role");
  const check = await admin.from("profiles").select("role").eq("id", userB.id).single();
  assert.equal(check.data.role, "student");
});

await test("row level security: students see only their own rows; anon sees nothing private", async () => {
  const ca = jar();
  const clientA = createRequestClient(ca);
  await clientA.auth.signInWithPassword({ email: emailA, password: "Passw0rd!A" });
  const own = await clientA.from("transactions").select("id, reference");
  assert.equal(own.error, null, own.error?.message);
  assert.ok(own.data.some((t) => t.reference === `ref-${tag}`));
  const cb = jar();
  const clientB = createRequestClient(cb);
  await clientB.auth.signInWithPassword({ email: emailB, password: "NewPassw0rd!B" });
  const theirs = await clientB.from("transactions").select("id").eq("reference", `ref-${tag}`);
  assert.equal(theirs.data.length, 0, "student B must not see student A's payment");
  const profilesB = await clientB.from("profiles").select("id");
  assert.ok(profilesB.data.every((p) => p.id === userB.id), "student B sees only own profile");
  const anon = createAnonDbClient();
  const anonTx = await anon.from("transactions").select("id");
  assert.ok(!anonTx.data || anonTx.data.length === 0);
  const spoof = await clientB.from("profiles").update({ role: "admin" }).eq("id", userB.id).select("role");
  const check = await admin.from("profiles").select("role").eq("id", userB.id).single();
  assert.equal(check.data.role, "student", "students cannot promote themselves");
  void spoof;
});

await test("storage: upload, download, signed + public urls, path traversal blocked", async () => {
  const s = admin.storage;
  assert.equal((await s.createBucket("private-files")).error, null);
  const up = await s.from("private-files").upload("a/b/hello.txt", Buffer.from("hello"), { contentType: "text/plain" });
  assert.equal(up.error, null);
  const dupe = await s.from("private-files").upload("a/b/hello.txt", Buffer.from("x"), { contentType: "text/plain" });
  assert.ok(dupe.error);
  const dl = await s.from("private-files").download("a/b/hello.txt");
  assert.equal(await dl.data.text(), "hello");
  assert.equal(dl.data.type, "text/plain");
  const signed = await s.from("private-files").createSignedUrl("a/b/hello.txt", 60);
  assert.match(signed.data.signedUrl, /^https:\/\/test\.example\/api\/storage\/private-files\/a\/b\/hello\.txt\?exp=\d+&token=[0-9a-f]{64}$/);
  const pub = s.from("public-assets").getPublicUrl("x/y.png");
  assert.equal(pub.data.publicUrl, "https://test.example/api/storage/public-assets/x/y.png");
  const evil = await s.from("private-files").upload("../escape.txt", Buffer.from("x"), {});
  assert.ok(evil.error);
  const buckets = await s.listBuckets();
  assert.ok(buckets.data.some((b) => b.id === "private-files"));
  await s.from("private-files").remove(["a/b/hello.txt"]);
  assert.ok((await s.from("private-files").download("a/b/hello.txt")).error);
});

await test("cleanup test data", async () => {
  await admin.from("transactions").delete().eq("reference", `ref-${tag}`);
  await admin.from("courses").delete().in("id", courseIds);
  for (const u of [userA, userB]) await admin.auth.admin.deleteUser(u.id);
  const gone = await admin.auth.admin.getUserById(userA.id);
  assert.equal(gone.data.user, null);
});

await closePool();
console.log(`\n${passed} passed`);
