import type { Metadata } from "next";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { verifyUnsubscribeToken } from "@/lib/email-campaigns/unsubscribe";
import { AIMONEYCODE_CAMPAIGN_SLUG } from "@/lib/email-campaigns/constants";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { UnsubscribeForm } from "@/app/unsubscribe/unsubscribe-form";

export const metadata: Metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = String(searchParams.token ?? "").trim();
  const parsed = token ? verifyUnsubscribeToken(token) : null;

  let valid = false;
  let label = "marketing email sequence";
  if (parsed?.campaignSlug === AIMONEYCODE_CAMPAIGN_SLUG) {
    valid = true;
    label = "AI Money Code email sequence";
  } else if (parsed?.campaignSlug) {
    try {
      const admin = await createAdminClientAsync();
      const { data } = await admin
        .from("webinar_followup_campaigns" as never)
        .select("name")
        .eq("slug", parsed.campaignSlug)
        .maybeSingle();
      if (data) {
        valid = true;
        label = `${String((data as { name: string }).name)} follow-up emails`;
      }
    } catch {
      valid = false;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <MarketplaceNav user={null} />
      <main className="mx-auto max-w-lg flex-1 px-4 py-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Unsubscribe</h1>
        {!valid ? (
          <p className="mt-4 leading-relaxed text-neutral-600">
            This unsubscribe link is invalid or expired. If you still receive emails, reply to
            the latest message and we will remove you.
          </p>
        ) : (
          <>
            <p className="mt-4 leading-relaxed text-neutral-600">
              Confirm below to stop the {label}. You will not be added to a public list. This does
              not delete any DigitalSkillX learning account you may have.
            </p>
            <UnsubscribeForm token={token} />
          </>
        )}
      </main>
      <MarketplaceFooter />
    </div>
  );
}
