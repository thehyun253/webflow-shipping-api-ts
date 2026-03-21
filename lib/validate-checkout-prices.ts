import type { NormalizedCheckoutBody } from "@/lib/validate-checkout-request";

export const MAX_PRICE_DIFF_CENTS = 2;

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export type ValidateCheckoutPricesResult =
  | { ok: true; sumCents: number }
  | { ok: false };

function withinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= MAX_PRICE_DIFF_CENTS;
}

export function validateCheckoutPrices(
  data: NormalizedCheckoutBody
): ValidateCheckoutPricesResult {
  const { items, productPrice } = data;

  for (const item of items) {
    const expectedCents = Math.round(item.singlePrice * item.quantity * 100);
    const actualCents = toCents(item.price);
    if (!withinTolerance(expectedCents, actualCents)) {
      return { ok: false };
    }
  }

  let sumCents = 0;
  for (const item of items) {
    sumCents += toCents(item.price);
  }

  const clientTotalCents = toCents(productPrice);
  if (!withinTolerance(sumCents, clientTotalCents)) {
    return { ok: false };
  }

  return { ok: true, sumCents };
}
