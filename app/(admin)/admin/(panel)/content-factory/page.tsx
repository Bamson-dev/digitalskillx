import { requireAdmin } from "@/lib/auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { LibraryBuildPanel } from "@/components/admin/library-build-panel";
import { ContentFactoryPanel } from "@/components/admin/content-factory-panel";
import { LearningPathCertificateOffers } from "@/components/admin/learning-path-certificate-offers";
import { OrganicAuthorityPanel } from "@/components/admin/organic-authority-panel";
import { SeoGrowthPanel } from "@/components/admin/seo-growth-panel";
import Link from "next/link";

export const metadata = { title: "Content Factory" };

export default async function AdminContentFactoryPage() {
  await requireAdmin();

  if (!contentFactoryEnabled()) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Content Factory</h1>
        <p className="text-sm text-muted">
          Feature disabled. Set <code className="rounded bg-neutral-100 px-1">CONTENT_FACTORY_ENABLED=true</code>{" "}
          in the server environment and redeploy.
        </p>
        <Link href="/admin/dashboard" className="text-sm text-brand hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Factory</h1>
        <p className="mt-1 text-sm text-muted">
          Enter a topic to discover YouTube tutorials, auto-build learning paths, and publish them
          to the free Learn library when quality checks pass.
        </p>
      </div>
      <LibraryBuildPanel />
      <ContentFactoryPanel />
      <SeoGrowthPanel />
      <OrganicAuthorityPanel />
      <LearningPathCertificateOffers />
    </div>
  );
}
