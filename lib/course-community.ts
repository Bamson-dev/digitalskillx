export type CourseCommunityLinks = {
  telegramUrl: string | null;
  whatsappUrl: string | null;
};

const TELEGRAM_HOSTS = new Set(["t.me", "telegram.me", "telegram.dog"]);
const WHATSAPP_HOSTS = new Set(["chat.whatsapp.com", "wa.me", "api.whatsapp.com"]);

function parseHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

export function normalizeTelegramCommunityUrl(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url || url.protocol !== "https:") return null;
  if (!TELEGRAM_HOSTS.has(url.hostname.replace(/^www\./, ""))) return null;
  return url.toString();
}

export function normalizeWhatsAppCommunityUrl(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url || url.protocol !== "https:") return null;
  if (!WHATSAPP_HOSTS.has(url.hostname.replace(/^www\./, ""))) return null;
  return url.toString();
}

export function courseCommunityFromRow(row: {
  community_telegram_url?: string | null;
  community_whatsapp_url?: string | null;
}): CourseCommunityLinks {
  return {
    telegramUrl: row.community_telegram_url?.trim() || null,
    whatsappUrl: row.community_whatsapp_url?.trim() || null,
  };
}

export function hasCourseCommunity(links: CourseCommunityLinks) {
  return Boolean(links.telegramUrl || links.whatsappUrl);
}
