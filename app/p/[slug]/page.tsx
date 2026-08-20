import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { isMissingRelationError } from "@/lib/schema-guard";
import { siteUrl } from "@/lib/org";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageRow = {
  title: string;
  slug: string;
  status: string;
  published_html: string | null;
  published_css: string | null;
};

async function loadPublished(slug: string): Promise<PageRow | null> {
  try {
    const admin = await createAdminClientAsync();
    const { data, error } = await admin
      .from("imported_landing_pages" as never)
      .select("title, slug, status, published_html, published_css")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error.message)) return null;
      throw new Error(error.message);
    }
    return (data as PageRow | null) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const page = await loadPublished(params.slug);
  if (!page) return { title: "Page not found", robots: { index: false, follow: false } };
  const canonical = `${siteUrl()}/p/${page.slug}`;
  return {
    title: page.title || page.slug,
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default async function ImportedLandingPublicPage({
  params,
}: {
  params: { slug: string };
}) {
  const page = await loadPublished(params.slug);
  if (!page?.published_html) notFound();

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(page.title)}</title><style>${page.published_css ?? ""}</style></head><body>${page.published_html}</body></html>`;

  return (
    <main className="min-h-screen bg-white">
      <iframe
        title={page.title || "Landing page"}
        srcDoc={srcDoc}
        className="h-screen w-full border-0"
        sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        referrerPolicy="no-referrer"
      />
    </main>
  );
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
