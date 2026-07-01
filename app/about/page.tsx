import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { ORG } from "@/lib/org";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <MarketplaceNav user={null} />
      <main className="mx-auto max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold">About DigitalSkillX</h1>
        <p className="mt-6 leading-relaxed text-neutral-600">
          DigitalSkillX is the learning marketplace from {ORG.name}. We help entrepreneurs
          and creators master profitable digital skills through structured, self-paced
          courses with verifiable certificates.
        </p>
        <Link href="/" className="mt-8 inline-block text-brand hover:text-brand-400">
          ← Back to courses
        </Link>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
