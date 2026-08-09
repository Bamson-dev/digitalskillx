import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { listCourseBundles } from "@/lib/course-bundles";
import { listCommerceOffers } from "@/lib/commerce-offers";
import { listDigitalProducts } from "@/lib/digital-products";
import { CommerceOffersPanel } from "@/components/admin/commerce-offers-panel";

export const metadata: Metadata = { title: "Offers" };

export default async function AdminOffersPage() {
  await requireAdmin();
  const admin = await getAdminSupabase();

  const [coursesRes, bundles, products, offers] = await Promise.all([
    admin.from("courses").select("id, title").order("title"),
    listCourseBundles(admin),
    listDigitalProducts(admin),
    listCommerceOffers(admin),
  ]);

  const courses = (coursesRes.data ?? []).map((c) => ({ id: c.id, title: c.title }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Offers</h1>
        <p className="mt-1 text-sm text-muted">
          Create priced offers for courses, bundles, and digital products.
        </p>
      </div>
      <CommerceOffersPanel
        courses={courses}
        bundles={bundles.map((b) => ({ id: b.id, title: b.title }))}
        digitalProducts={products.map((p) => ({ id: p.id, title: p.title }))}
        initialOffers={offers}
      />
    </div>
  );
}
