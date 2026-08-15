import type { Metadata } from "next";
import Link from "next/link";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { getCachedPublishedAuthorityLibrary } from "@/lib/content-factory/library-cache";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { siteUrl } from "@/lib/org";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Guides | DigitalSkillX",
  description: "Supporting educational guides connected to free DigitalSkillX learning paths.",
  alternates: { canonical: `${siteUrl()}/guides` },
  openGraph: {
    title: "Guides | DigitalSkillX",
    description: "Supporting educational guides connected to free DigitalSkillX learning paths.",
    url: `${siteUrl()}/guides`,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Guides | DigitalSkillX",
    description: "Supporting educational guides connected to free DigitalSkillX learning paths.",
  },
};

export default async function GuidesIndexPage() {
  if (!contentFactoryEnabled()) {
    return (
      <div className="marketplace">
        <MarketplaceNav user={null} hideCurrencyToggle />
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h1 className="text-2xl font-bold">Guides</h1>
          <p className="mt-2 text-muted">Guides are unavailable right now.</p>
        </div>
        <MarketplaceFooter />
      </div>
    );
  }

  let articles: Awaited<ReturnType<typeof getCachedPublishedAuthorityLibrary>> = [];
  try {
    articles = await getCachedPublishedAuthorityLibrary();
  } catch {
    articles = [];
  }

  return (
    <div className="marketplace min-w-0 overflow-x-hidden">
      <MarketplaceNav user={null} hideCurrencyToggle />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <Link href="/learn" className="text-sm text-muted hover:text-brand">
          ← Free Learning Library
        </Link>
        <header className="mt-4 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Guides</h1>
          <p className="mt-3 text-neutral-600">
            Useful supporting pages connected to published DigitalSkillX learning paths. Not a mass blog.
          </p>
        </header>
        {articles.length === 0 ? (
          <p className="mt-10 text-sm text-muted">No published guides yet.</p>
        ) : (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {articles.map((article) => (
              <li key={article.id} className="rounded-2xl border border-app p-4">
                <Link
                  href={`/guides/${article.slug}`}
                  className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {article.content_type.replace(/_/g, " ")}
                    {article.category ? ` · ${article.category}` : ""}
                  </p>
                  <h2 className="mt-2 font-semibold text-neutral-900">{article.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{article.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MarketplaceFooter />
    </div>
  );
}
