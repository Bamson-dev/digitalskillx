import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";

export type DigitalProduct = {
  id: string;
  title: string;
  description: string;
  price_ngn: number;
  price_usd: number;
  access_instructions: string;
  download_url: string | null;
  is_active: boolean;
};

export async function listDigitalProducts(admin: SupabaseClient): Promise<DigitalProduct[]> {
  const { data, error } = await admin
    .from("digital_products")
    .select(
      "id, title, description, price_ngn, price_usd, access_instructions, download_url, is_active",
    )
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as DigitalProduct[];
}

export async function saveDigitalProduct(
  admin: SupabaseClient,
  input: {
    id?: string;
    title: string;
    description?: string;
    priceNgn: number;
    priceUsd?: number;
    accessInstructions?: string;
    downloadUrl?: string | null;
    isActive?: boolean;
    createdBy?: string | null;
  },
): Promise<string> {
  const title = input.title.trim();
  if (title.length < 2) throw new Error("Product title is required.");
  const row = {
    title: title.slice(0, 200),
    description: (input.description ?? "").trim().slice(0, 4000),
    price_ngn: Math.max(0, Math.round(input.priceNgn)),
    price_usd: Math.max(0, Number(input.priceUsd ?? 0)),
    access_instructions: (input.accessInstructions ?? "").trim().slice(0, 4000),
    download_url: input.downloadUrl?.trim().slice(0, 2000) || null,
    is_active: input.isActive !== false,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await admin.from("digital_products").update(row).eq("id", input.id);
    if (error) throw new Error(error.message);
    return input.id;
  }

  const { data, error } = await admin
    .from("digital_products")
    .insert({ ...row, created_by: input.createdBy ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteDigitalProduct(admin: SupabaseClient, id: string) {
  const { error } = await admin.from("digital_products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function grantDigitalProductEntitlement(
  admin: SupabaseClient,
  params: { studentId: string; digitalProductId: string; transactionId?: string | null },
): Promise<{ created: boolean }> {
  const { data: existing } = await admin
    .from("digital_product_entitlements")
    .select("id")
    .eq("student_id", params.studentId)
    .eq("digital_product_id", params.digitalProductId)
    .maybeSingle();
  if (existing) return { created: false };

  const { error } = await admin.from("digital_product_entitlements").insert({
    student_id: params.studentId,
    digital_product_id: params.digitalProductId,
    transaction_id: params.transactionId ?? null,
  });
  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      return { created: false };
    }
    throw new Error(error.message);
  }
  return { created: true };
}
