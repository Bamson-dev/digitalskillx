/**
 * Public, read-only purchase status for the post-payment page.
 *
 * Success is reported only when the database shows a payment that the server
 * already verified (transactions.status = "success") AND an enrolment exists.
 * A browser redirect, a query string or a missing record never produces "paid".
 *
 * Nothing personal is returned: no email, no student ID, no payment details
 * beyond the catalog price of the product.
 */
import {
  readExternalPaystackData,
  resolveExternalProductByKey,
} from "./paystack-external-products";

export type PurchaseStatusTransaction = {
  status: string | null;
  course_id: string | null;
  paystack_data: unknown;
};

export type PurchaseFulfillment =
  | "none"
  | "payment_received"
  | "payment_verified"
  | "enrolled"
  | "email_sent"
  | "email_failed"
  | "fulfillment_failed"
  | "awaiting_course_publish"
  | "attribution_required";

export type PurchaseStatusResponse = {
  /** paid: verified and enrolled. pending: not confirmed yet. failed: Paystack reported failure. */
  status: "paid" | "pending" | "failed";
  fulfillment: PurchaseFulfillment;
  enrolled: boolean;
  emailSent: boolean;
  /** Present only when status is "paid". Values come from the server catalog. */
  product?: {
    key: string;
    title: string;
    valueNgn: number;
    currency: string;
    courseUrl: string;
  };
};

const REFERENCE_PATTERN = /^[A-Za-z0-9_.\-]{4,100}$/;

export function isValidPurchaseReference(reference: unknown): reference is string {
  return typeof reference === "string" && REFERENCE_PATTERN.test(reference);
}

const PENDING: PurchaseStatusResponse = {
  status: "pending",
  fulfillment: "none",
  enrolled: false,
  emailSent: false,
};

export function computePurchaseStatus(input: {
  transaction: PurchaseStatusTransaction | null;
  enrolled: boolean;
  siteBaseUrl: string;
}): PurchaseStatusResponse {
  const { transaction, enrolled } = input;
  if (!transaction) return { ...PENDING };

  // Only products in the external catalog are reported. Anything else looks like "not found".
  const external = readExternalPaystackData(transaction.paystack_data);
  const product = external ? resolveExternalProductByKey(external.product_key) : null;
  if (!external || !product) return { ...PENDING };

  const emailSent = Boolean(external.access_email_sent_at);
  const fulfillment = external.fulfillment_status as PurchaseFulfillment;

  if (transaction.status === "failed") {
    return { status: "failed", fulfillment, enrolled: false, emailSent: false };
  }

  if (transaction.status === "success" && enrolled && transaction.course_id) {
    const base = input.siteBaseUrl.replace(/\/$/, "");
    return {
      status: "paid",
      fulfillment,
      enrolled: true,
      emailSent,
      product: {
        key: product.key,
        title: product.title,
        valueNgn: product.expectedAmountNgn,
        currency: product.currency,
        courseUrl: `${base}/courses/${transaction.course_id}`,
      },
    };
  }

  return { status: "pending", fulfillment, enrolled, emailSent };
}
