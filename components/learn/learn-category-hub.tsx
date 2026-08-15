import Link from "next/link";
import {
  LIBRARY_CATEGORIES,
  libraryCategoryLabel,
  type LibraryCategoryId,
} from "@/lib/content-factory/library-shared";
import { formatNaira } from "@/lib/currency";
import {
  buildCategoryHubCopy,
  categoryHubHref,
} from "@/lib/content-factory/seo-shared";

export type CategoryHubPath = {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  difficulty: string | null;
  artwork_public_url: string | null;
  creator_name?: string | null;
  certificate_enabled?: boolean | null;
  certificate_price_ngn?: number | null;
};

export function LearnCategoryHub({
  category,
  paths,
  relatedCategories,
  authorityArticles = [],
}: {
  category: Exclude<LibraryCategoryId, "all">;
  paths: CategoryHubPath[];
  relatedCategories: Array<{ id: Exclude<LibraryCategoryId, "all">; label: string; count: number }>;
  authorityArticles?: Array<{
    id: string;
    title: string;
    slug: string;
    content_type: string;
    description: string;
  }>;
}) {
  const copy = buildCategoryHubCopy(category);
  const beginners = paths.filter((path) => path.difficulty === "beginner");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <Link
        href="/learn"
        className="text-sm text-muted hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        ← Free Learning Library
      </Link>

      <header className="mt-4 max-w-3xl">
        <p className="text-sm font-medium text-brand">Category hub</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{copy.title}</h1>
        <p className="mt-3 text-neutral-600">{copy.description}</p>
        <p className="mt-3 text-sm text-neutral-700">
          {paths.length} published learning path{paths.length === 1 ? "" : "s"}. Optional DigitalSkillX
          certificates are available on some paths after you finish the free lessons.
        </p>
      </header>

      {beginners.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Beginner-friendly paths</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {beginners.slice(0, 6).map((path) => (
              <PathCard key={path.id} path={path} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">All {libraryCategoryLabel(category)} paths</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {paths.map((path) => (
            <PathCard key={path.id} path={path} />
          ))}
        </ul>
      </section>

      {authorityArticles.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Useful guides</h2>
          <ul className="mt-4 space-y-3">
            {authorityArticles.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/guides/${article.slug}`}
                  className="font-medium text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {article.title}
                </Link>
                <p className="mt-1 text-sm text-neutral-600">{article.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {relatedCategories.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Related categories</h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {relatedCategories.map((row) => (
              <li key={row.id}>
                <Link
                  href={categoryHubHref(row.id)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-app px-3 text-sm hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {row.label} · {row.count}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="mt-10 flex flex-wrap gap-3 text-sm" aria-label="Browse categories">
        {LIBRARY_CATEGORIES.filter((c) => c.id !== "all" && c.id !== category).slice(0, 8).map((c) => (
          <Link
            key={c.id}
            href={`/learn?category=${c.id}`}
            className="text-muted hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Filter: {c.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function PathCard({ path }: { path: CategoryHubPath }) {
  return (
    <li className="min-w-0 rounded-2xl border border-app p-4">
      <Link
        href={`/learn/${path.slug}`}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <h3 className="break-words font-semibold text-neutral-900">{path.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{path.short_description}</p>
        <p className="mt-3 text-xs text-muted">
          {path.creator_name ? `Creator: ${path.creator_name}` : "Creator credited on the path page"}
          {path.difficulty ? ` · ${path.difficulty}` : ""}
          {path.certificate_enabled && typeof path.certificate_price_ngn === "number"
            ? ` · Certificate ${formatNaira(path.certificate_price_ngn)}`
            : ""}
        </p>
      </Link>
    </li>
  );
}
