import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { ORG, siteUrl } from "@/lib/org";

export const metadata: Metadata = { title: "Terms of Service" };

const LAST_UPDATED = "1 July 2026";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <MarketplaceNav user={null} />
      <main className="mx-auto max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
        <p className="mt-3 text-sm text-neutral-500">Last updated: {LAST_UPDATED}</p>
        <p className="mt-6 leading-relaxed text-neutral-600">
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of{" "}
          {ORG.platformName}, operated by {ORG.name} ({ORG.rc}), at {siteUrl()} (the
          &ldquo;Platform&rdquo;). By creating an account, purchasing a course, or otherwise
          using the Platform, you agree to these Terms. If you do not agree, do not use the
          Platform.
        </p>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">1. The Service</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              {ORG.platformName} is an online course marketplace where learners can browse,
              purchase, and complete self-paced digital courses. Features may include video
              lessons, quizzes, assignments, progress tracking, and verifiable certificates of
              completion. We may add, modify, or discontinue features at any time with reasonable
              notice where practicable.
            </p>
            <p>
              Course content is provided for educational purposes. We do not guarantee specific
              employment, income, or business outcomes from completing any course.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">2. Eligibility and Accounts</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              You must be at least 16 years old to use the Platform, or have verifiable consent
              from a parent or legal guardian. You are responsible for maintaining the
              confidentiality of your login credentials and for all activity under your account.
            </p>
            <p>
              You agree to provide accurate, current information when registering and to update it
              as needed. You may not share your account, transfer access to another person, or
              create multiple accounts to circumvent restrictions or policies.
            </p>
            <p>
              We may suspend or terminate accounts that violate these Terms, engage in fraud, or
              pose a security risk to the Platform or other users.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">3. Course Purchases and Access</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              When you purchase a course, you receive a personal, non-exclusive, non-transferable,
              revocable licence to access that course&apos;s content for your own learning. Unless
              expressly stated otherwise, access is for individual use only and does not include
              the right to resell, redistribute, broadcast, or publicly share course materials.
            </p>
            <p>
              Prices are displayed at checkout and may be shown in Nigerian Naira (NGN) or other
              currencies supported by our payment processor. We reserve the right to change
              pricing for future purchases; changes do not affect courses you have already paid
              for.
            </p>
            <p>
              Access to purchased courses continues for as long as the course remains available on
              the Platform, subject to these Terms. We are not obligated to maintain any specific
              course indefinitely.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">4. Payments</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              Payments are processed through Paystack, a third-party payment provider. By
              completing a purchase, you authorise us and Paystack to charge your selected payment
              method for the stated amount, including applicable taxes or fees disclosed at
              checkout.
            </p>
            <p>
              You represent that you are authorised to use the payment method provided. Failed or
              reversed payments may result in suspension of course access until the matter is
              resolved. Refunds are governed by our{" "}
              <Link href="/refund-policy" className="text-brand hover:text-brand-400">
                Refund Policy
              </Link>
              , which is incorporated into these Terms by reference.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">5. Intellectual Property</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              All Platform software, branding, design, and underlying technology are owned by or
              licensed to {ORG.name}. Course videos, text, graphics, assessments, and other
              materials are protected by copyright and other intellectual property laws.
            </p>
            <p>
              You may not copy, download (except where explicitly permitted), modify, distribute,
              scrape, reverse engineer, or create derivative works from Platform content without
              our prior written consent. You may not remove watermarks, copyright notices, or
              other proprietary markings.
            </p>
            <p>
              Certificates issued through the Platform may be displayed by you for personal or
              professional purposes, but may not be altered, forged, or misrepresented as
              credentials from institutions other than {ORG.certificateOrg}.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">6. Acceptable Use</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>You agree not to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Use the Platform for any unlawful purpose or in violation of applicable regulations.</li>
              <li>Share login credentials or sell, sublicense, or pool course access.</li>
              <li>Upload malware, attempt unauthorised access, or interfere with Platform security.</li>
              <li>Harass, abuse, or impersonate other users or {ORG.name} staff.</li>
              <li>Use automated tools to extract content or data from the Platform without permission.</li>
              <li>Circumvent technical measures designed to protect course content or certificates.</li>
            </ul>
            <p>
              We may investigate violations and take appropriate action, including content
              removal, account suspension, and referral to law enforcement where warranted.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">7. Certificates</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              Certificates are issued when you meet the completion criteria defined for a course,
              which may include minimum progress, quiz scores, or assignment submissions.
              Certificates are verifiable through the Platform&apos;s verification feature and
              reflect completion of the stated course only.
            </p>
            <p>
              Issuance of a certificate is final for refund purposes. Once a certificate has been
              issued for a course, that purchase is not eligible for a refund under our Refund
              Policy.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">8. Disclaimers</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              The Platform and all course content are provided on an &ldquo;as is&rdquo; and
              &ldquo;as available&rdquo; basis. To the fullest extent permitted by law, {ORG.name}{" "}
              disclaims all warranties, express or implied, including merchantability, fitness for
              a particular purpose, and non-infringement.
            </p>
            <p>
              We do not warrant that the Platform will be uninterrupted, error-free, or free of
              harmful components. Educational content reflects the knowledge and views of course
              creators at the time of publication and may become outdated.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">9. Limitation of Liability</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              To the maximum extent permitted by applicable law, {ORG.name} and its directors,
              employees, and affiliates shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, or for loss of profits, data, goodwill, or
              business opportunities arising from your use of the Platform.
            </p>
            <p>
              Our total aggregate liability for any claim arising out of or relating to these
              Terms or the Platform shall not exceed the greater of (a) the amount you paid to us
              for the specific course giving rise to the claim in the twelve (12) months before
              the claim, or (b) ten thousand Nigerian Naira (₦10,000).
            </p>
            <p>
              Nothing in these Terms limits liability that cannot be limited under Nigerian law,
              including liability for fraud or wilful misconduct.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">10. Consumer Rights</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              If you are a consumer in Nigeria, nothing in these Terms affects your statutory
              rights under the Federal Competition and Consumer Protection Act and related
              regulations. International buyers may have additional rights under the consumer
              protection laws of their country of residence, which apply where they cannot be
              lawfully excluded.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">11. Governing Law and Disputes</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute
              arising from these Terms or your use of the Platform shall first be addressed
              through good-faith negotiation. If unresolved within thirty (30) days, disputes
              shall be submitted to the exclusive jurisdiction of the courts of Lagos State,
              Nigeria, except where mandatory consumer protection rules in your country require
              otherwise.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">12. Changes to These Terms</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              We may update these Terms from time to time. Material changes will be posted on this
              page with an updated &ldquo;Last updated&rdquo; date. Continued use of the Platform
              after changes take effect constitutes acceptance of the revised Terms. If you do not
              agree to the changes, you should stop using the Platform and contact us regarding
              any active purchases.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">13. Contact</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              For questions about these Terms, please contact {ORG.name} at {ORG.location}{" "}
              ({ORG.rc}). Registered users may reach us through the{" "}
              <Link href="/login?next=/support" className="text-brand hover:text-brand-400">
                Support
              </Link>{" "}
              section of the Platform.
            </p>
          </div>
        </section>

        <p className="mt-10 text-sm text-neutral-500">
          See also our{" "}
          <Link href="/privacy" className="text-brand hover:text-brand-400">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/refund-policy" className="text-brand hover:text-brand-400">
            Refund Policy
          </Link>
          .
        </p>

        <Link href="/" className="mt-8 inline-block text-brand hover:text-brand-400">
          ← Back to courses
        </Link>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
