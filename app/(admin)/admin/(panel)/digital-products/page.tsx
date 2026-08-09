import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { listDigitalProducts } from "@/lib/digital-products";
import { DigitalProductsPanel } from "@/components/admin/digital-products-panel";

export const metadata: Metadata = { title: "Digital products" };

export default async function AdminDigitalProductsPage() {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const products = await listDigitalProducts(admin);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Digital products</h1>
        <p className="mt-1 text-sm text-muted">
          Non-course products with download links or access instructions.
        </p>
      </div>
      <DigitalProductsPanel initialProducts={products} />
    </div>
  );
}
