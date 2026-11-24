import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { getPool, type Queryable } from "./pool";
import {
  SESSION_COOKIE_NAME,
  cookieOptions,
  signAccessToken,
  verifyAccessToken,
  sessionMaxAgeSeconds,
  type AccessClaims,
} from "./jwt";

/**
 * Authentication on the existing auth.users table (bcrypt hashes preserved).
 * Exposes the same call surface the app used before (signInWithPassword, getUser,
 * setSession, signOut, admin.*, mfa.*) so call sites keep working unchanged.
 */

export type AuthError = { message: string; status: number; code?: string; name: string };

export type AuthUser = {
  id: string;
  aud: string;
  role: string;
  email: string | undefined;
  email_confirmed_at: string | null;
  phone: string;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: Record<string, any>;
  user_metadata: Record<string, any>;
  identities: unknown[];
  created_at: string;
  updated_at: string;
  banned_until?: string | null;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: AuthUser;
};

export type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export type CookieJar = {
  getAll(): { name: string; value: string }[];
  setAll(cookies: CookieToSet[]): void;
};

export type SessionMeta = { userAgent?: string | null; ip?: string | null };

function authError(message: string, status = 400, code?: string): AuthError {
  return { message, status, code, name: "AuthApiError" };
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.Qp6yZtEeSdjXWQHbMQvWqCoZ2Kqi";

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d));

type UserRow = {
  id: string;
  aud: string | null;
  role: string | null;
  email: string | null;
  encrypted_password: string | null;
  email_confirmed_at: Date | null;
  phone: string | null;
  confirmed_at: Date | null;
  last_sign_in_at: Date | null;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  banned_until: Date | null;
  deleted_at: Date | null;
};

function toUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    aud: row.aud ?? "authenticated",
    role: row.role ?? "authenticated",
    email: row.email ?? undefined,
    email_confirmed_at: iso(row.email_confirmed_at),
    phone: row.phone ?? "",
    confirmed_at: iso(row.confirmed_at),
    last_sign_in_at: iso(row.last_sign_in_at),
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: iso(row.created_at) ?? new Date().toISOString(),
    updated_at: iso(row.updated_at) ?? new Date().toISOString(),
    banned_until: iso(row.banned_until),
  };
}

const USER_COLS = `id, aud, role, email, encrypted_password, email_confirmed_at, phone, confirmed_at,
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until, deleted_at`;

function db(): Queryable {
  return getPool() as unknown as Queryable;
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const res = await db().query<UserRow>(
    `select ${USER_COLS} from auth.users where lower(email) = lower($1) and deleted_at is null limit 1`,
    [email.trim()],
  );
  return res.rows[0] ?? null;
}

async function findUserById(id: string): Promise<UserRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await db().query<UserRow>(`select ${USER_COLS} from auth.users where id = $1 and deleted_at is null limit 1`, [id]);
  return res.rows[0] ?? null;
}

function isBanned(row: UserRow) {
  return Boolean(row.banned_until && row.banned_until.getTime() > Date.now());
}

async function buildSession(row: UserRow, meta: SessionMeta, aal: "aal1" | "aal2" = "aal1", sessionId?: string): Promise<AuthSession> {
  const sid = sessionId ?? randomUUID();
  if (!sessionId) {
    await db().query(
      `insert into auth.sessions (id, user_id, created_at, updated_at, user_agent, ip)
       values ($1, $2, now(), now(), $3, $4::inet)`,
      [sid, row.id, meta.userAgent?.slice(0, 500) ?? null, normaliseIp(meta.ip)],
    );
  }
  const user = toUser(row);
  const { token, expiresAt } = await signAccessToken({
    sub: row.id,
    email: row.email,
    session_id: sid,
    aal,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
  });
  return {
    access_token: token,
    refresh_token: sid,
    token_type: "bearer",
    expires_in: sessionMaxAgeSeconds(),
    expires_at: expiresAt,
    user,
  };
}

function normaliseIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.trim();
  return /^[0-9a-f:.]+$/i.test(v) ? v : null;
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238, SHA-1, 30 s, 6 digits)
// ---------------------------------------------------------------------------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export function totpCode(secretB32: string, atMs = Date.now()) {
  const counter = Math.floor(atMs / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}
export function verifyTotp(secretB32: string, code: string) {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const now = Date.now();
  return [-1, 0, 1].some((w) => totpCode(secretB32, now + w * 30_000) === clean);
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

type Listener = (event: string, session: AuthSession | null) => void;

export type AuthApi = ReturnType<typeof createAuthApi>;

export function createAuthApi(options: { cookies?: CookieJar; meta?: () => SessionMeta } = {}) {
  const listeners = new Set<Listener>();
  const jar = options.cookies;

  const notify = (event: string, session: AuthSession | null) => {
    setTimeout(() => {
      for (const l of listeners) {
        try {
          void l(event, session);
        } catch {
          // listener errors must not break auth
        }
      }
    }, 0);
  };

  async function readClaims(): Promise<AccessClaims | null> {
    if (!jar) return null;
    const cookie = jar.getAll().find((c) => c.name === SESSION_COOKIE_NAME);
    return verifyAccessToken(cookie?.value);
  }

  function writeCookie(token: string) {
    jar?.setAll([{ name: SESSION_COOKIE_NAME, value: token, options: cookieOptions() }]);
  }
  function clearCookie() {
    jar?.setAll([{ name: SESSION_COOKIE_NAME, value: "", options: { ...cookieOptions(0), maxAge: 0, expires: new Date(0) } }]);
  }

  /** Verifies the token and that its session row still exists and the user is allowed in. */
  async function resolveUser(claims: AccessClaims): Promise<UserRow | null> {
    const res = await db().query<UserRow & { sid: string }>(
      `select ${USER_COLS.split(",").map((c) => `u.${c.trim()}`).join(", ")}, s.id as sid
         from auth.sessions s join auth.users u on u.id = s.user_id
        where s.id = $1 and u.id = $2 and u.deleted_at is null
          and (s.not_after is null or s.not_after > now())
        limit 1`,
      [claims.session_id, claims.sub],
    );
    const row = res.rows[0];
    if (!row || isBanned(row)) return null;
    return row;
  }

  const auth = {
    async getUser(jwt?: string): Promise<{ data: { user: AuthUser | null }; error: AuthError | null }> {
      const claims = jwt ? await verifyAccessToken(jwt) : await readClaims();
      if (!claims) return { data: { user: null }, error: authError("Auth session missing!", 400, "session_not_found") };
      const row = await resolveUser(claims);
      if (!row) return { data: { user: null }, error: authError("Session from session_id claim in JWT does not exist", 403, "session_not_found") };
      return { data: { user: toUser(row) }, error: null };
    },

    async getSession(): Promise<{ data: { session: AuthSession | null }; error: AuthError | null }> {
      const claims = await readClaims();
      if (!claims || !jar) return { data: { session: null }, error: null };
      const token = jar.getAll().find((c) => c.name === SESSION_COOKIE_NAME)!.value;
      const user: AuthUser = {
        id: claims.sub,
        aud: "authenticated",
        role: "authenticated",
        email: claims.email ?? undefined,
        email_confirmed_at: null,
        phone: "",
        confirmed_at: null,
        last_sign_in_at: null,
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
        identities: [],
        created_at: "",
        updated_at: "",
      };
      return {
        data: {
          session: {
            access_token: token,
            refresh_token: claims.session_id,
            token_type: "bearer",
            expires_in: Math.max(0, claims.exp - Math.floor(Date.now() / 1000)),
            expires_at: claims.exp,
            user,
          },
        },
        error: null,
      };
    },

    async signInWithPassword(creds: { email: string; password: string }) {
      const email = (creds.email ?? "").trim().toLowerCase();
      const row = email ? await findUserByEmail(email) : null;
      const hash = row?.encrypted_password || DUMMY_HASH;
      const match = await bcrypt.compare(creds.password ?? "", hash);
      if (!row || !row.encrypted_password || !match) {
        return { data: { user: null, session: null }, error: authError("Invalid login credentials", 400, "invalid_credentials") };
      }
      if (isBanned(row)) {
        return { data: { user: null, session: null }, error: authError("User is banned", 400, "user_banned") };
      }
      if (!row.email_confirmed_at) {
        return { data: { user: null, session: null }, error: authError("Email not confirmed", 400, "email_not_confirmed") };
      }
      const session = await buildSession(row, options.meta?.() ?? {});
      await db().query("update auth.users set last_sign_in_at = now() where id = $1", [row.id]);
      if (jar) {
        writeCookie(session.access_token);
        notify("SIGNED_IN", session);
      }
      return { data: { user: session.user, session }, error: null };
    },

    async setSession(tokens: { access_token: string; refresh_token?: string }) {
      const claims = await verifyAccessToken(tokens.access_token);
      if (!claims) return { data: { user: null, session: null }, error: authError("Invalid session tokens", 401, "bad_jwt") };
      const row = await resolveUser(claims);
      if (!row) return { data: { user: null, session: null }, error: authError("Session no longer exists", 401, "session_not_found") };
      writeCookie(tokens.access_token);
      const session: AuthSession = {
        access_token: tokens.access_token,
        refresh_token: claims.session_id,
        token_type: "bearer",
        expires_in: Math.max(0, claims.exp - Math.floor(Date.now() / 1000)),
        expires_at: claims.exp,
        user: toUser(row),
      };
      notify("SIGNED_IN", session);
      return { data: { user: session.user, session }, error: null };
    },

    async signOut(_opts?: { scope?: "global" | "local" | "others" }) {
      const claims = await readClaims();
      if (claims) {
        await db().query("delete from auth.sessions where id = $1", [claims.session_id]).catch(() => undefined);
      }
      clearCookie();
      notify("SIGNED_OUT", null);
      return { error: null as AuthError | null };
    },

    onAuthStateChange(cb: Listener) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => void listeners.delete(cb) } } };
    },

    async updateUser(attrs: { password?: string; email?: string; data?: Record<string, unknown> }) {
      const claims = await readClaims();
      if (!claims) return { data: { user: null }, error: authError("Auth session missing!", 401, "session_not_found") };
      const row = await resolveUser(claims);
      if (!row) return { data: { user: null }, error: authError("Auth session missing!", 401, "session_not_found") };
      const res = await updateUserRow(row.id, {
        password: attrs.password,
        email: attrs.email,
        user_metadata: attrs.data,
      });
      return res.error ? { data: { user: null }, error: res.error } : { data: { user: res.user }, error: null };
    },

    /** Verifies a one-time token from generateLink and starts a session. */
    async verifyOtp(params: { token_hash: string; type: string }) {
      const hash = sha256(params.token_hash);
      const res = await db().query<{ id: string; user_id: string }>(
        `delete from auth.one_time_tokens
          where token_hash = $1 and created_at > now() - interval '24 hours'
        returning id, user_id`,
        [hash],
      );
      const token = res.rows[0];
      if (!token) return { data: { user: null, session: null }, error: authError("Email link is invalid or has expired", 403, "otp_expired") };
      const row = await findUserById(token.user_id);
      if (!row || isBanned(row)) return { data: { user: null, session: null }, error: authError("User not found", 404, "user_not_found") };
      await db().query(
        "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), last_sign_in_at = now() where id = $1",
        [row.id],
      );
      const fresh = (await findUserById(row.id)) ?? row;
      const session = await buildSession(fresh, options.meta?.() ?? {});
      if (jar) {
        writeCookie(session.access_token);
        notify("SIGNED_IN", session);
      }
      return { data: { user: session.user, session }, error: null };
    },

    async exchangeCodeForSession(_code: string) {
      return { data: { user: null, session: null }, error: authError("OAuth code exchange is not supported", 400, "flow_state_not_found") };
    },

    // --- MFA ---------------------------------------------------------------
    mfa: {
      async listFactors() {
        const claims = await readClaims();
        if (!claims) return { data: null, error: authError("Auth session missing!", 401) };
        const res = await db().query<{ id: string; friendly_name: string | null; status: string; factor_type: string; created_at: Date; updated_at: Date }>(
          "select id, friendly_name, status::text, factor_type::text, created_at, updated_at from auth.mfa_factors where user_id = $1 order by created_at",
          [claims.sub],
        );
        const all = res.rows.map((r) => ({
          id: r.id,
          friendly_name: r.friendly_name ?? undefined,
          factor_type: r.factor_type,
          status: r.status,
          created_at: iso(r.created_at),
          updated_at: iso(r.updated_at),
        }));
        return { data: { all, totp: all.filter((f) => f.factor_type === "totp" && f.status === "verified"), phone: [] }, error: null };
      },

      async enroll(params: { factorType: "totp"; friendlyName?: string }) {
        const claims = await readClaims();
        if (!claims) return { data: null, error: authError("Auth session missing!", 401) };
        const secret = base32Encode(randomBytes(20));
        const id = randomUUID();
        const issuer = "DigitalSkillX";
        const label = claims.email ?? claims.sub;
        const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
        try {
          await db().query(
            `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
             values ($1, $2, $3, 'totp', 'unverified', $4, now(), now())`,
            [id, claims.sub, params.friendlyName ?? null, secret],
          );
        } catch (err) {
          return { data: null, error: authError((err as Error).message, 422) };
        }
        const QRCode = (await import("qrcode")).default;
        const svg = await QRCode.toString(uri, { type: "svg" });
        return {
          data: { id, type: "totp" as const, friendly_name: params.friendlyName, totp: { qr_code: `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`, secret, uri } },
          error: null,
        };
      },

      async challenge(params: { factorId: string }) {
        const claims = await readClaims();
        if (!claims) return { data: null, error: authError("Auth session missing!", 401) };
        const f = await db().query("select id from auth.mfa_factors where id = $1 and user_id = $2", [params.factorId, claims.sub]);
        if (!f.rows[0]) return { data: null, error: authError("MFA factor not found", 404, "mfa_factor_not_found") };
        const id = randomUUID();
        await db().query("insert into auth.mfa_challenges (id, factor_id, created_at, ip_address) values ($1, $2, now(), $3::inet)", [id, params.factorId, normaliseIp(options.meta?.().ip) ?? "0.0.0.0"]);
        return { data: { id, type: "totp" as const, expires_at: Math.floor(Date.now() / 1000) + 300 }, error: null };
      },

      async verify(params: { factorId: string; challengeId: string; code: string }) {
        const claims = await readClaims();
        if (!claims) return { data: null, error: authError("Auth session missing!", 401) };
        const res = await db().query<{ secret: string; status: string }>(
          `select f.secret, f.status::text from auth.mfa_factors f
             join auth.mfa_challenges c on c.factor_id = f.id
            where f.id = $1 and f.user_id = $2 and c.id = $3 and c.verified_at is null
              and c.created_at > now() - interval '5 minutes'`,
          [params.factorId, claims.sub, params.challengeId],
        );
        const f = res.rows[0];
        if (!f) return { data: null, error: authError("MFA challenge not found or expired", 422, "mfa_challenge_expired") };
        if (!verifyTotp(f.secret, params.code)) {
          return { data: null, error: authError("Invalid TOTP code entered", 422, "mfa_verification_failed") };
        }
        await db().query("update auth.mfa_challenges set verified_at = now() where id = $1", [params.challengeId]);
        await db().query("update auth.mfa_factors set status = 'verified', updated_at = now() where id = $1", [params.factorId]);
        await db().query("update auth.sessions set aal = 'aal2', updated_at = now() where id = $1", [claims.session_id]).catch(() => undefined);
        const row = await findUserById(claims.sub);
        if (!row) return { data: null, error: authError("User not found", 404) };
        const session = await buildSession(row, {}, "aal2", claims.session_id);
        if (jar) {
          writeCookie(session.access_token);
          notify("MFA_CHALLENGE_VERIFIED", session);
        }
        return { data: { access_token: session.access_token, token_type: "bearer", expires_in: session.expires_in, refresh_token: session.refresh_token, user: session.user }, error: null };
      },

      async getAuthenticatorAssuranceLevel() {
        const claims = await readClaims();
        if (!claims) return { data: null, error: authError("Auth session missing!", 401) };
        const f = await db().query("select 1 from auth.mfa_factors where user_id = $1 and status = 'verified' limit 1", [claims.sub]);
        return {
          data: { currentLevel: claims.aal, nextLevel: f.rows[0] ? "aal2" : claims.aal, currentAuthenticationMethods: [] },
          error: null,
        };
      },
    },

    // --- Admin -------------------------------------------------------------
    admin: {
      async createUser(attrs: {
        email?: string;
        password?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
        phone?: string;
      }): Promise<{ data: { user: AuthUser }; error: AuthError | null }> {
        const email = attrs.email?.trim().toLowerCase();
        if (!email) return { data: { user: null as unknown as AuthUser }, error: authError("Email is required", 422, "validation_failed") };
        if (await findUserByEmail(email)) {
          return { data: { user: null as unknown as AuthUser }, error: authError("A user with this email address has already been registered", 422, "email_exists") };
        }
        const id = randomUUID();
        const hash = attrs.password ? await bcrypt.hash(attrs.password, 10) : null;
        const appMeta = { provider: "email", providers: ["email"], ...(attrs.app_metadata ?? {}) };
        const client = await getPool().connect();
        try {
          await client.query("begin");
          await client.query(
            `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                     raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
                                     recovery_token, email_change_token_new, email_change)
             values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3,
                     case when $4::boolean then now() else null end, $5::jsonb, $6::jsonb, now(), now(), '', '', '', '')`,
            [id, email, hash, Boolean(attrs.email_confirm), JSON.stringify(appMeta), JSON.stringify(attrs.user_metadata ?? {})],
          );
          await client.query(
            `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             values ($1::text, $2::uuid, $3::jsonb, 'email', null, now(), now())`,
            [id, id, JSON.stringify({ sub: id, email, email_verified: Boolean(attrs.email_confirm), phone_verified: false })],
          );
          await client.query("commit");
        } catch (err) {
          await client.query("rollback").catch(() => undefined);
          const msg = (err as Error).message;
          if (/duplicate key/i.test(msg)) {
            return { data: { user: null as unknown as AuthUser }, error: authError("A user with this email address has already been registered", 422, "email_exists") };
          }
          return { data: { user: null as unknown as AuthUser }, error: authError(msg, 500, "unexpected_failure") };
        } finally {
          client.release();
        }
        const row = await findUserById(id);
        return { data: { user: (row ? toUser(row) : null) as unknown as AuthUser }, error: null };
      },

      async updateUserById(
        id: string,
        attrs: {
          email?: string;
          password?: string;
          email_confirm?: boolean;
          user_metadata?: Record<string, unknown>;
          app_metadata?: Record<string, unknown>;
          ban_duration?: string;
        },
      ): Promise<{ data: { user: AuthUser }; error: AuthError | null }> {
        const res = await updateUserRow(id, attrs);
        return res.error ? { data: { user: null as unknown as AuthUser }, error: res.error } : { data: { user: res.user as AuthUser }, error: null };
      },

      async getUserById(id: string): Promise<{ data: { user: AuthUser }; error: AuthError | null }> {
        const row = await findUserById(id);
        if (!row) return { data: { user: null as unknown as AuthUser }, error: authError("User not found", 404, "user_not_found") };
        return { data: { user: toUser(row) }, error: null };
      },

      async listUsers(params: { page?: number; perPage?: number } = {}): Promise<{
        data: { users: AuthUser[]; aud: string; total: number; nextPage: number | null; lastPage: number };
        error: AuthError | null;
      }> {
        const perPage = Math.min(Math.max(params.perPage ?? 50, 1), 1000);
        const page = Math.max(params.page ?? 1, 1);
        const res = await db().query<UserRow>(
          `select ${USER_COLS} from auth.users where deleted_at is null order by created_at asc, id asc limit $1 offset $2`,
          [perPage, (page - 1) * perPage],
        );
        const total = await db().query<{ n: string }>("select count(*)::text as n from auth.users where deleted_at is null");
        return {
          data: { users: res.rows.map(toUser), aud: "authenticated", total: Number(total.rows[0]?.n ?? 0), nextPage: res.rows.length === perPage ? page + 1 : null, lastPage: Math.ceil(Number(total.rows[0]?.n ?? 0) / perPage) },
          error: null,
        };
      },

      async deleteUser(id: string): Promise<{ data: { user: null }; error: AuthError | null }> {
        try {
          await db().query("delete from auth.users where id = $1", [id]);
          return { data: { user: null }, error: null };
        } catch (err) {
          return { data: { user: null }, error: authError((err as Error).message, 500) };
        }
      },

      /** Creates a one-time sign-in token. The caller builds the emailed link from `properties`. */
      async generateLink(params: { type: "recovery" | "magiclink" | "signup" | "invite"; email: string; options?: { redirectTo?: string } }): Promise<{
        data: {
          user: AuthUser;
          properties: { action_link: string; email_otp: string; hashed_token: string; redirect_to: string; verification_type: string };
        };
        error: AuthError | null;
      }> {
        const email = params.email.trim().toLowerCase();
        const row = await findUserByEmail(email);
        if (!row) return { data: { user: null as unknown as AuthUser, properties: null as never }, error: authError("User not found", 404, "user_not_found") };
        const raw = randomBytes(24).toString("hex");
        const type = params.type === "recovery" ? "recovery_token" : "confirmation_token";
        await db().query(
          `insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, created_at, updated_at)
           values ($1, $2, $3::auth.one_time_token_type, $4, $5, now(), now())
           on conflict (user_id, token_type) do update set token_hash = excluded.token_hash, relates_to = excluded.relates_to, created_at = now(), updated_at = now()`,
          [randomUUID(), row.id, type, sha256(raw), email],
        ).catch(async () => {
          // older schemas without the unique constraint
          await db().query("delete from auth.one_time_tokens where user_id = $1 and token_type = $2::auth.one_time_token_type", [row.id, type]);
          await db().query(
            `insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, created_at, updated_at)
             values ($1, $2, $3::auth.one_time_token_type, $4, $5, now(), now())`,
            [randomUUID(), row.id, type, sha256(raw), email],
          );
        });
        const redirectTo = params.options?.redirectTo ?? "";
        const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").replace(/\/$/, "");
        const actionLink = `${base}/auth/callback?token_hash=${raw}&type=${params.type}${redirectTo ? `&redirect_to=${encodeURIComponent(redirectTo)}` : ""}`;
        return {
          data: {
            user: toUser(row),
            properties: {
              action_link: actionLink,
              email_otp: String(Math.floor(100000 + Math.random() * 900000)),
              hashed_token: raw,
              redirect_to: redirectTo,
              verification_type: params.type,
            },
          },
          error: null,
        };
      },
    },
  };

  async function updateUserRow(
    id: string,
    attrs: {
      email?: string;
      password?: string;
      email_confirm?: boolean;
      user_metadata?: Record<string, unknown>;
      app_metadata?: Record<string, unknown>;
      ban_duration?: string;
    },
  ): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    const row = await findUserById(id);
    if (!row) return { user: null, error: authError("User not found", 404, "user_not_found") };
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      sets.push(sql.replace("?", `$${params.length}`));
    };
    if (attrs.password) add("encrypted_password = ?", await bcrypt.hash(attrs.password, 10));
    if (attrs.email) {
      const email = attrs.email.trim().toLowerCase();
      const clash = await findUserByEmail(email);
      if (clash && clash.id !== id) return { user: null, error: authError("A user with this email address has already been registered", 422, "email_exists") };
      add("email = ?", email);
    }
    if (attrs.email_confirm) sets.push("email_confirmed_at = coalesce(email_confirmed_at, now())");
    if (attrs.user_metadata) add("raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || ?::jsonb", JSON.stringify(attrs.user_metadata));
    if (attrs.app_metadata) add("raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || ?::jsonb", JSON.stringify(attrs.app_metadata));
    if (attrs.ban_duration) {
      if (attrs.ban_duration === "none") sets.push("banned_until = null");
      else {
        const hours = /^(\d+)h$/.exec(attrs.ban_duration)?.[1];
        if (hours) add("banned_until = now() + (?::int * interval '1 hour')", Number(hours));
      }
    }
    if (!sets.length) return { user: toUser(row), error: null };
    sets.push("updated_at = now()");
    params.push(id);
    try {
      await db().query(`update auth.users set ${sets.join(", ")} where id = $${params.length}`, params);
      if (attrs.email) {
        await db().query(
          "update auth.identities set identity_data = identity_data || jsonb_build_object('email', $1::text), updated_at = now() where user_id = $2 and provider = 'email'",
          [attrs.email.trim().toLowerCase(), id],
        );
      }
    } catch (err) {
      return { user: null, error: authError((err as Error).message, 500) };
    }
    const updated = await findUserById(id);
    return { user: updated ? toUser(updated) : null, error: null };
  }

  return auth;
}
