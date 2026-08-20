import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { LandingPagesPanel } from "@/components/admin/landing-pages-panel";

export const metadata: Metadata = { title: "Landing page import" };
export const dynamic = "force-dynamic";

export default async function AdminLandingPagesPage() {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const { data: courses } = await admin
    .from("courses")
    .select("id, title")
    .order("title", { ascending: true })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Landing page import</h1>
        <p className="mt-1 text-sm text-muted">
          Paste a public URL, import the page, map conversion CTAs to DigitalSkillX checkout, then
          publish to /p/your-slug.
        </p>
      </div>
      <LandingPagesPanel
        courses={(courses ?? []).map((c) => ({ id: c.id, title: c.title ?? "Untitled" }))}
      />
    </div>
  );
}
