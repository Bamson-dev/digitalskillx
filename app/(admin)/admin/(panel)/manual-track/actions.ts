"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  parseManualTrackPurchaseBody,
  runManualTrackPurchase,
} from "@/lib/manual-purchase-tracking";

export type ManualTrackState = { error?: string; message?: string; warning?: string };

export async function submitManualTrackPurchase(
  _prev: ManualTrackState,
  formData: FormData,
): Promise<ManualTrackState> {
  try {
    await requireAdmin();

    const parsed = parseManualTrackPurchaseBody({
      email: String(formData.get("email") ?? ""),
      reference: String(formData.get("reference") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      productName: String(formData.get("productName") ?? ""),
    });
    if (!parsed.ok) return { error: parsed.error };

    const result = await runManualTrackPurchase(parsed.value);
    if (!result.ok) {
      return { error: result.error };
    }

    await logAudit({
      action: "manual_purchase_enrolled_and_tracked",
      targetType: "course",
      targetId: result.courseId,
      metadata: {
        email: parsed.value.email,
        reference: parsed.value.reference,
        amount: parsed.value.amount,
        productName: parsed.value.productName,
        studentId: result.studentId,
        trackingFailed: result.trackingFailed ?? false,
      },
    });

    revalidatePath("/admin/manual-track");
    return {
      message: `Student enrolled and purchase tracked successfully for ${parsed.value.email}`,
      warning: result.trackingWarning,
    };
  } catch (err) {
    return {
      error: `Enrollment failed: ${err instanceof Error ? err.message : "Could not enroll and track purchase."}`,
    };
  }
}
