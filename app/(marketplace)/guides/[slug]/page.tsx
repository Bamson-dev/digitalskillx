import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { getCachedPublishedAuthorityArticle } from "@/lib/content-factory/library-cache";
import { AuthorityMarkdown } from "@/components/learn/authority-markdown";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { buildAuthorityJsonLd } from "@/lib/content-factory/authority-shared";
import { jsonLdIsSafe, serializeJsonLd } from "@/lib/content-factory/library-shared";
import { siteUrl } from "@/lib/org";

export const revalidate = 300;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!contentFactoryEnabled()) return { title: "Guide" };
  try {
    const loaded = await getCachedPublishedAuthorityArticle(params.slug);
    if (!loaded) return { title: "Guide" };
    const title = loaded.seo_title || loaded.title;
    const description = loaded.seo_description || loaded.description;
    const url = `${siteUrl()}/guides/${loaded.slug}`;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { title, description, url, type: "article" },
      twitter: { card: "summary_large_image", title, description },
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: "Guide" };
  }
}

export default async function GuideArticlePage({ params }: Props) {
  if (!contentFactoryEnabled()) notFound();
  let loaded;
  try {
    loaded = await getCachedPublishedAuthorityArticle(params.slug);
  } catch {
    notFound();
  }
  if (!loaded || loaded.status !== "published") notFound();

  const jsonLd = buildAuthorityJsonLd({
    siteUrl: siteUrl(),
    slug: loaded.slug,
    title: loaded.title,
    description: loaded.description,
    contentType: loaded.content_type,
    publishedAt: loaded.published_at,
    updatedAt: loaded.updated_at,
    pathTitle: loaded.path_title,
    pathSlug: loaded.path_slug,
  });

  return (
    <div className="marketplace min-w-0 overflow-x-hidden">
      <MarketplaceNav user={null} hideCurrencyToggle />
      {jsonLdIsSafe(jsonLd) ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      ) : null}
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Link href="/guides" className="text-sm text-muted hover:text-brand">
          ← Guides
        </Link>
        <header className="mt-4">
          <p className="text-sm font-medium capitalize text-brand">
            {loaded.content_type.replace(/_/g, " ")}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{loaded.title}</h1>
          <p className="mt-3 text-neutral-600">{loaded.description}</p>
          {loaded.path_slug && loaded.path_title ? (
            <p className="mt-4 text-sm text-neutral-700">
              Related learning path:{" "}
              <Link href={`/learn/${loaded.path_slug}`} className="text-brand hover:underline">
                {loaded.path_title}
              </Link>
            </p>
          ) : null}
        </header>

        <div className="mt-8">
          <AuthorityMarkdown markdown={loaded.body_md} />
        </div>

        {Array.isArray(loaded.internal_links) && loaded.internal_links.length ? (
          <nav className="mt-10 rounded-2xl border border-app p-4" aria-label="Related links">
            <h2 className="font-semibold">Continue learning</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(loaded.internal_links as Array<{ label?: string; href?: string }>)
                .filter((link) => link?.href?.startsWith("/") && link.label)
                .slice(0, 6)
                .map((link) => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link href={link.href!} className="text-brand hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        ) : null}

        <p className="mt-10 text-xs text-muted">
          DigitalSkillX educational guide. Original YouTube lesson ownership remains with creators. No
          partnership or endorsement is claimed.
        </p>
      </article>
      <MarketplaceFooter />
    </div>
  );
}
