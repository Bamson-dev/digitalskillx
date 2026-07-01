import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { ORG, siteUrl } from "@/lib/org";

export const metadata: Metadata = { title: "Refund Policy" };

const LAST_UPDATED = "1 July 2026";

export default function RefundPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <MarketplaceNav user={null} />
      <main className="mx-auto max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Refund Policy</h1>
        <p className="mt-3 text-sm text-neutral-500">Last updated: {LAST_UPDATED}</p>
        <p className="mt-6 leading-relaxed text-neutral-600">
          This Refund Policy explains when and how buyers may request a refund for course
          purchases on {ORG.platformName}, operated by {ORG.name} ({ORG.rc}) at {siteUrl()}. It
          applies to learners in Nigeria and international buyers. By purchasing a course, you
          agree to this policy in addition to our{" "}
          <Link href="/terms" className="text-brand hover:text-brand-400">
            Terms of Service
          </Link>
          .
        </p>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">1. Overview</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              Digital course purchases are generally final because access to downloadable or
              streamable content is delivered immediately upon payment. However, we offer a
              limited refund window for buyers who have genuinely not engaged with a course, as
              described below. This policy is designed to be fair to learners while protecting
              against abuse of digital goods.
            </p>
            <p>
              All payments are processed through Paystack. Approved refunds are returned to the
              original payment method used at checkout. Processing times depend on your bank or
              card issuer and may take five to fourteen (5–14) business days after we initiate
              the refund.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">2. Eligibility for a Refund</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              You may request a full refund for a course purchase if <strong className="text-neutral-800">all</strong> of
              the following conditions are met at the time of your request:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Your request is submitted within <strong className="text-neutral-800">seven (7) calendar days</strong> of
                the original purchase date.
              </li>
              <li>
                You have consumed less than <strong className="text-neutral-800">twenty percent (20%)</strong> of the
                course content, measured by lesson completion, video watch time, or equivalent
                progress tracked on the Platform.
              </li>
              <li>
                No certificate of completion has been issued for that course.
              </li>
              <li>
                You have not previously received a refund for the same course.
              </li>
            </ul>
            <p>
              If any of the above conditions are not met, the purchase is not eligible for a
              refund under this policy, except where required by mandatory consumer protection
              law in your jurisdiction.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">3. No Refunds After Certificate Issuance</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              Once a certificate of completion has been issued for a course, that purchase is{" "}
              <strong className="text-neutral-800">not eligible for any refund</strong>, regardless
              of when the certificate was earned or how much of the course remains unconsumed.
              Certificates represent verified completion and cannot be revoked as part of a refund
              process.
            </p>
            <p>
              If you believe a certificate was issued in error, contact us through Support with
              details. We will investigate and correct platform records where appropriate, but
              this does not automatically entitle you to a refund if you have substantially
              completed the course.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">4. Non-Refundable Situations</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>Refunds will not be granted in the following circumstances:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>More than 20% of the course has been accessed or completed.</li>
              <li>The seven-day refund window has expired.</li>
              <li>A certificate has been issued for the course.</li>
              <li>
                The request is based on dissatisfaction with course outcomes, income expectations,
                or subjective quality after substantial use of the materials.
              </li>
              <li>
                Account suspension or termination due to a violation of our Terms of Service.
              </li>
              <li>
                Promotional or discounted purchases, unless otherwise stated at the time of
                purchase.
              </li>
              <li>Duplicate purchases where you have already received a refund for the same course.</li>
            </ul>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">5. How to Request a Refund</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              To request a refund, sign in to your account and submit a request through the{" "}
              <Link href="/login?next=/support" className="text-brand hover:text-brand-400">
                Support
              </Link>{" "}
              section. Include your order reference, the course name, the purchase date, and a
              brief reason for the request. We will review your eligibility based on Platform
              records and respond within five (5) business days.
            </p>
            <p>
              Approved refunds are processed through Paystack to the original payment method.
              We cannot refund to a different card, bank account, or third party. Currency
              conversion or international transaction fees charged by your bank are outside our
              control and are generally non-refundable.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">6. Chargebacks and Payment Disputes</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              If you have a concern about a charge, please contact us through Support before
              initiating a chargeback or payment dispute with your bank or card issuer. Chargebacks
              filed without first attempting to resolve the issue with us may result in immediate
              suspension of your account and revocation of course access while the dispute is
              investigated.
            </p>
            <p>
              We reserve the right to provide Paystack and your financial institution with
              evidence of your purchase, course access logs, progress data, certificate issuance
              (if any), and communications with our support team. Fraudulent or abusive chargebacks
              may lead to permanent account termination and referral to relevant authorities.
            </p>
            <p>
              If a chargeback is decided in your favour after you have continued to access course
              materials, you must cease use of the content and delete any copies in your
              possession.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">7. Nigeria and International Buyers</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              <strong className="text-neutral-800">Nigerian buyers:</strong> This policy operates
              alongside your rights under the Federal Competition and Consumer Protection Act. Where
              mandatory law provides you with rights that exceed this policy, those rights prevail.
            </p>
            <p>
              <strong className="text-neutral-800">International buyers:</strong> You may purchase
              courses from outside Nigeria. Refund eligibility is assessed using the same criteria
              in Section 2. Payment is processed in the currency shown at checkout; exchange rates
              and foreign transaction fees imposed by your bank are your responsibility. Refund
              amounts are returned in the original transaction currency where possible.
            </p>
            <p>
              Time zones do not extend the seven-day refund window. The purchase timestamp recorded
              on the Platform (UTC) is used to calculate eligibility.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">8. Partial Refunds and Exceptions</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              We do not offer partial refunds for partially completed courses. Eligible refunds
              are full refunds of the purchase price paid for the specific course.
            </p>
            <p>
              In exceptional cases—such as a verified technical failure that permanently prevented
              access to purchased content—we may issue a refund or credit outside the standard
              policy at our sole discretion. Such exceptions do not set a precedent for future
              requests.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">9. Changes to This Policy</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              We may update this Refund Policy from time to time. Changes apply to purchases made
              after the updated policy is published. The policy in effect at the time of your
              purchase governs your refund eligibility for that transaction.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">10. Contact</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              For refund enquiries, contact {ORG.name}, {ORG.location} ({ORG.rc}). Registered
              users should use the{" "}
              <Link href="/login?next=/support" className="text-brand hover:text-brand-400">
                Support
              </Link>{" "}
              section for the fastest response.
            </p>
          </div>
        </section>

        <Link href="/" className="mt-12 inline-block text-brand hover:text-brand-400">
          ← Back to courses
        </Link>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
