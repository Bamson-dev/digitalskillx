import type { Metadata } from "next";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { verifyUnsubscribeToken } from "@/lib/email-campaigns/unsubscribe";
import { AIMONEYCODE_CAMPAIGN_SLUG } from "@/lib/email-campaigns/constants";
import { UnsubscribeForm } from "@/app/unsubscribe/unsubscribe-form";

export const metadata: Metadata = { title: "Unsubscribe" };

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = String(searchParams.token ?? "").trim();
  const parsed = token ? verifyUnsubscribeToken(token) : null;
  const valid =
    Boolean(parsed) && parsed?.campaignSlug === AIMONEYCODE_CAMPAIGN_SLUG;

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
              Confirm below to stop the AI Money Code email sequence. You will not be added to a
              public list, and this does not delete your learning account.
            </p>
            <UnsubscribeForm token={token} />
          </>
        )}
      </main>
      <MarketplaceFooter />
    </div>
  );
}
