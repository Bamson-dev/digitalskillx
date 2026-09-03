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
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="reference">Payment Reference</Label>
        <Input id="reference" name="reference" required placeholder="TRF-001" />
      </div>
      <div>
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          min={1}
          step={1}
          defaultValue={BUILD_SOFTWARE_WITH_AI_PRODUCT.expectedAmountNgn}
          required
        />
      </div>
      <div>
        <Label htmlFor="productName">Product Name</Label>
        <Input
          id="productName"
          name="productName"
          defaultValue={BUILD_SOFTWARE_WITH_AI_PRODUCT.title}
          required
        />
      </div>
      <SubmitButton pendingText="Enrolling and tracking…">Track Purchase</SubmitButton>
    </form>
  );
}
