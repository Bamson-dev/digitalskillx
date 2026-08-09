import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import {
  deleteDigitalProduct,
  listDigitalProducts,
  saveDigitalProduct,
} from "@/lib/digital-products";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-digital-products", 120);
  if (limited) return limited;

  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  try {
    const products = await listDigitalProducts(auth.admin);
    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list products." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-digital-products-save", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: {
    id?: string;
    title?: string;
    description?: string;
    priceNgn?: number;
    priceUsd?: number;
    accessInstructions?: string;
    downloadUrl?: string | null;
    isActive?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const id = await saveDigitalProduct(auth.admin, {
      id: body.id,
      title: String(body.title ?? ""),
      description: body.description,
      priceNgn: Number(body.priceNgn ?? 0),
      priceUsd: body.priceUsd,
      accessInstructions: body.accessInstructions,
      downloadUrl: body.downloadUrl ?? null,
      isActive: body.isActive,
      createdBy: auth.user.id,
    });

    await logAudit({
      action: body.id ? "digital_product_updated" : "digital_product_created",
      targetType: "digital_product",
      targetId: id,
      metadata: { title: body.title },
    });

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save product." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-digital-products-delete", 20);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Product id is required." }, { status: 400 });
  }

  try {
    await deleteDigitalProduct(auth.admin, id);
    await logAudit({
      action: "digital_product_deleted",
      targetType: "digital_product",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed." },
      { status: 400 },
    );
  }
}
