import { requireAdmin } from "@/lib/auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { ContentFactoryPanel } from "@/components/admin/content-factory-panel";
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
          Import a YouTube playlist, generate a free learning path, then approve for public publishing.
        </p>
      </div>
      <ContentFactoryPanel />
    </div>
  );
}
