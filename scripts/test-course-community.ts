import assert from "node:assert/strict";
import {
  normalizeTelegramCommunityUrl,
  normalizeWhatsAppCommunityUrl,
  courseCommunityFromRow,
  hasCourseCommunity,
} from "../lib/course-community";

assert.equal(normalizeTelegramCommunityUrl("https://t.me/mygroup"), "https://t.me/mygroup");
assert.equal(normalizeTelegramCommunityUrl("t.me/mygroup"), "https://t.me/mygroup");
assert.equal(normalizeTelegramCommunityUrl("https://example.com/x"), null);

assert.equal(
  normalizeWhatsAppCommunityUrl("https://chat.whatsapp.com/AbCdEf"),
  "https://chat.whatsapp.com/AbCdEf",
);
assert.equal(normalizeWhatsAppCommunityUrl("https://wa.me/2348012345678"), "https://wa.me/2348012345678");
assert.equal(normalizeWhatsAppCommunityUrl("not-a-url"), null);

const links = courseCommunityFromRow({
  community_telegram_url: "https://t.me/test",
  community_whatsapp_url: "",
});
assert.equal(links.telegramUrl, "https://t.me/test");
assert.equal(links.whatsappUrl, null);
assert.equal(hasCourseCommunity(links), true);

console.log("PASS: course community helpers");
