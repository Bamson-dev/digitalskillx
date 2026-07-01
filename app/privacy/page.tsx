import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { ORG, siteUrl } from "@/lib/org";

export const metadata: Metadata = { title: "Privacy Policy" };

const LAST_UPDATED = "1 July 2026";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <MarketplaceNav user={null} />
      <main className="mx-auto max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-3 text-sm text-neutral-500">Last updated: {LAST_UPDATED}</p>
        <p className="mt-6 leading-relaxed text-neutral-600">
          This Privacy Policy explains how {ORG.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
          &ldquo;our&rdquo;) collects, uses, stores, and protects personal data when you use{" "}
          {ORG.platformName} at {siteUrl()} (the &ldquo;Platform&rdquo;). We are committed to
          handling your information responsibly and in line with the Nigeria Data Protection Act
          2023 (NDPA) and, where applicable, other data protection laws in the countries where
          our learners are located.
        </p>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">1. Who We Are</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              {ORG.platformName} is operated by {ORG.name}, a company registered in Nigeria (
              {ORG.rc}), with its principal place of business in {ORG.location}. We provide an
              online marketplace for self-paced digital courses, certificates, quizzes, and
              related learning tools to students in Nigeria and internationally.
            </p>
            <p>
              For the purposes of data protection law, {ORG.name} is the data controller
              responsible for your personal data collected through the Platform. If you have
              questions about this policy or how we handle your data, please contact us using the
              details in Section 8 below.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">2. Data We Collect</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>We collect personal data that you provide directly and data generated through your use of the Platform, including:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-neutral-800">Account and identity data:</strong> full
                name, email address, password (stored in hashed form), and profile information
                you choose to add.
              </li>
              <li>
                <strong className="text-neutral-800">Student and learning data:</strong> course
                enrollments, lesson progress, quiz and assignment submissions, grades, completion
                status, certificate issuance records, and support messages you send through the
                Platform.
              </li>
              <li>
                <strong className="text-neutral-800">Payment data:</strong> transaction
                references, amounts, currency, and payment status. Card and bank details are
                collected and processed directly by Paystack, our payment processor; we do not
                store full card numbers on our servers.
              </li>
              <li>
                <strong className="text-neutral-800">Technical and usage data:</strong> IP
                address, browser type, device information, pages visited, session timestamps,
                and cookies or similar technologies used to keep you signed in and to improve
                Platform performance.
              </li>
              <li>
                <strong className="text-neutral-800">Communications:</strong> records of
                correspondence when you contact us for support, billing queries, or data rights
                requests.
              </li>
            </ul>
            <p>
              We do not knowingly collect personal data from children under 16 without appropriate
              parental or guardian consent. If you believe a minor has provided us data without
              consent, please contact us so we can take appropriate action.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">3. Legal Basis for Processing</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>We process your personal data only where we have a lawful basis to do so, including:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-neutral-800">Contract:</strong> to create and manage your
                account, deliver purchased courses, issue certificates, and provide customer
                support.
              </li>
              <li>
                <strong className="text-neutral-800">Legal obligation:</strong> to comply with
                applicable laws, tax and accounting requirements, and lawful requests from
                regulators or courts.
              </li>
              <li>
                <strong className="text-neutral-800">Legitimate interests:</strong> to secure the
                Platform, prevent fraud and abuse, analyse usage to improve our services, and
                enforce our Terms of Service—balanced against your rights and freedoms.
              </li>
              <li>
                <strong className="text-neutral-800">Consent:</strong> where required for optional
                marketing communications or non-essential cookies. You may withdraw consent at any
                time without affecting the lawfulness of processing before withdrawal.
              </li>
            </ul>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">4. How We Share Your Data</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              We do not sell your personal data. We share data only with trusted parties who
              help us operate the Platform, and only to the extent necessary:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-neutral-800">Paystack:</strong> to process payments from
                buyers in Nigeria and internationally. Paystack&apos;s use of your data is governed
                by its own privacy policy.
              </li>
              <li>
                <strong className="text-neutral-800">Infrastructure and service providers:</strong>{" "}
                hosting, database, authentication, analytics, and email delivery partners that
                process data on our behalf under contractual confidentiality and security
                obligations.
              </li>
              <li>
                <strong className="text-neutral-800">Professional advisers:</strong> lawyers,
                accountants, or auditors where reasonably required.
              </li>
              <li>
                <strong className="text-neutral-800">Legal and safety:</strong> regulators, law
                enforcement, or other parties when required by law or to protect the rights,
                property, or safety of {ORG.name}, our users, or the public.
              </li>
            </ul>
            <p>
              If {ORG.name} is involved in a merger, acquisition, or sale of assets, your data
              may be transferred as part of that transaction, subject to the same protections
              described in this policy.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">5. Data Retention</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              We retain personal data only for as long as necessary for the purposes described in
              this policy, unless a longer period is required or permitted by law.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Account and learning records are kept for the life of your account and for a
                reasonable period afterward to support certificates, dispute resolution, and legal
                compliance.
              </li>
              <li>
                Payment and transaction records are retained for at least seven (7) years where
                required for accounting, tax, and audit purposes.
              </li>
              <li>
                Support correspondence is retained for up to three (3) years unless a longer
                period is needed to resolve an ongoing matter.
              </li>
              <li>
                Technical logs may be kept for a shorter period, typically up to twelve (12)
                months, for security and troubleshooting.
              </li>
            </ul>
            <p>
              When data is no longer needed, we delete or anonymise it in a secure manner.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">6. Your Rights</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              Depending on your location and applicable law, you may have the following rights
              regarding your personal data:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Access a copy of the personal data we hold about you.</li>
              <li>Request correction of inaccurate or incomplete data.</li>
              <li>Request deletion of your data, subject to legal and contractual exceptions.</li>
              <li>Object to or restrict certain processing activities.</li>
              <li>Request data portability in a structured, commonly used format where applicable.</li>
              <li>Withdraw consent where processing is based on consent.</li>
              <li>
                Lodge a complaint with the Nigeria Data Protection Commission (NDPC) or your
                local supervisory authority.
              </li>
            </ul>
            <p>
              To exercise these rights, submit a request through the Support section of your
              account after signing in, or contact us using the details in Section 8. We may need
              to verify your identity before responding. We aim to reply within thirty (30) days.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">7. International Data Transfers</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              {ORG.platformName} serves learners in Nigeria and around the world. Your personal
              data may be stored or processed in Nigeria and in other countries where our service
              providers operate, including countries that may not provide the same level of data
              protection as your home jurisdiction.
            </p>
            <p>
              Where we transfer personal data outside Nigeria, we implement appropriate safeguards
              such as standard contractual clauses, provider security certifications, or other
              mechanisms recognised under the NDPA and applicable international frameworks. By
              using the Platform, you acknowledge that such transfers may occur as described here.
            </p>
            <p>
              International buyers should note that payment processing through Paystack may involve
              additional cross-border data flows governed by Paystack&apos;s policies and applicable
              financial regulations.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">8. Contact Us</h2>
          <div className="mt-4 space-y-4 leading-relaxed text-neutral-600">
            <p>
              If you have questions about this Privacy Policy, wish to exercise your data rights,
              or need to report a privacy concern, please contact:
            </p>
            <p>
              <strong className="text-neutral-800">{ORG.name}</strong>
              <br />
              {ORG.location}
              <br />
              Registration: {ORG.rc}
              <br />
              Website: {siteUrl()}
            </p>
            <p>
              Registered users may also submit privacy-related requests through the{" "}
              <Link href="/login?next=/support" className="text-brand hover:text-brand-400">
                Support
              </Link>{" "}
              section of the Platform. We will acknowledge your request and respond within the
              timeframes required by applicable law.
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
