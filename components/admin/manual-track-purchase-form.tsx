"use client";

import { useFormState } from "react-dom";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  submitManualTrackPurchase,
  type ManualTrackState,
} from "@/app/(admin)/admin/(panel)/manual-track/actions";
import { BUILD_SOFTWARE_WITH_AI_PRODUCT } from "@/lib/paystack-external-products";

const empty: ManualTrackState = {};

export function ManualTrackPurchaseForm() {
  const [state, action] = useFormState(submitManualTrackPurchase, empty);

  return (
    <form action={action} className="space-y-4">
      {state.message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.message}
        </p>
      ) : null}
      {state.warning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {state.warning}
        </p>
      ) : null}
      {state.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div>
        <Label htmlFor="email">Customer Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="buyer@email.com"
        />
        <p className="mt-1.5 text-xs text-muted">
          That’s all you need. Amount (₦{BUILD_SOFTWARE_WITH_AI_PRODUCT.expectedAmountNgn.toLocaleString("en-NG")}),
          product name, and payment reference are filled in automatically.
        </p>
      </div>

      <input type="hidden" name="amount" value={BUILD_SOFTWARE_WITH_AI_PRODUCT.expectedAmountNgn} />
      <input type="hidden" name="productName" value={BUILD_SOFTWARE_WITH_AI_PRODUCT.title} />

      <SubmitButton pendingText="Enrolling and tracking…">Track Purchase</SubmitButton>
    </form>
  );
}
