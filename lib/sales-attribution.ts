/**
 * Sales funnel attribution (UTM + session). Client-safe; no secrets.
 * Stored in sessionStorage / short-lived cookie — never cards/passwords/tokens.
 */

export type SalesAttribution = {
  session_id: string;
  sales_page_id?: string;
  course_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  device?: "mobile" | "tablet" | "desktop";
  captured_at?: string;
};

const STORAGE_KEY = "dsx_sales_attr";
const VIEW_PREFIX = "dsx_sp_view:";
const SCROLL_PREFIX = "dsx_sp_scroll:";
const SECTION_PREFIX = "dsx_sp_section:";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function detectDeviceCategory(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function readStorage(): SalesAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SalesAttribution;
    if (!parsed?.session_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(attr: SalesAttribution): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
  } catch {
    /* ignore quota */
  }
}

/** Capture/merge UTMs from the current URL into the session attribution bag. */
export function captureSalesAttribution(partial?: Partial<SalesAttribution>): SalesAttribution {
  const existing = readStorage();
  const params =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;

  const next: SalesAttribution = {
    session_id: existing?.session_id || randomId(),
    sales_page_id: partial?.sales_page_id ?? existing?.sales_page_id,
    course_id: partial?.course_id ?? existing?.course_id,
    referrer:
      partial?.referrer ??
      existing?.referrer ??
      (typeof document !== "undefined" ? document.referrer.slice(0, 500) || undefined : undefined),
    device: partial?.device ?? existing?.device ?? detectDeviceCategory(),
    captured_at: existing?.captured_at ?? new Date().toISOString(),
  };

  for (const key of UTM_KEYS) {
    const fromUrl = params?.get(key)?.trim();
    const fromPartial = partial?.[key];
    const value = (fromUrl || fromPartial || existing?.[key] || "").trim().slice(0, 120);
    if (value) next[key] = value;
  }

  writeStorage(next);
  return next;
}

export function getSalesAttribution(): SalesAttribution | null {
  return readStorage();
}

/** Flat string metadata safe for product_events / Paystack metadata. */
export function attributionToMetadata(
  attr: SalesAttribution | null | undefined,
  extra?: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (attr) {
    out.session_id = attr.session_id;
    if (attr.sales_page_id) out.sales_page_id = attr.sales_page_id;
    if (attr.course_id) out.course_id = attr.course_id;
    if (attr.utm_source) out.utm_source = attr.utm_source;
    if (attr.utm_medium) out.utm_medium = attr.utm_medium;
    if (attr.utm_campaign) out.utm_campaign = attr.utm_campaign;
    if (attr.utm_content) out.utm_content = attr.utm_content;
    if (attr.utm_term) out.utm_term = attr.utm_term;
    if (attr.referrer) out.referrer = attr.referrer.slice(0, 300);
    if (attr.device) out.device = attr.device;
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) continue;
      out[k] = v;
    }
  }
  return out;
}

/** Paystack metadata must be Record<string, string>. */
export function attributionToPaystackStrings(
  attr: SalesAttribution | null | undefined,
  extra?: Record<string, string | undefined>,
): Record<string, string> {
  const meta = attributionToMetadata(attr, extra);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = String(v).slice(0, 200);
  }
  return out;
}

/** One sales_page_view per course+session (anti-spam). */
export function shouldRecordSalesPageView(courseId: string): boolean {
  if (typeof window === "undefined") return false;
  const attr = captureSalesAttribution({ course_id: courseId });
  const key = `${VIEW_PREFIX}${courseId}:${attr.session_id}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function shouldRecordScrollDepth(courseId: string, depth: number): boolean {
  if (typeof window === "undefined") return false;
  const attr = getSalesAttribution() ?? captureSalesAttribution({ course_id: courseId });
  const key = `${SCROLL_PREFIX}${courseId}:${attr.session_id}:${depth}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function shouldRecordSectionView(courseId: string, sectionId: string): boolean {
  if (typeof window === "undefined") return false;
  const attr = getSalesAttribution() ?? captureSalesAttribution({ course_id: courseId });
  const key = `${SECTION_PREFIX}${courseId}:${attr.session_id}:${sectionId}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}
