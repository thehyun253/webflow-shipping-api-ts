import { computeOrderPacks } from "@/lib/compute-order-packs";
import { getShippingRates } from "@/lib/shipping";
import type { NormalizedCheckoutItem } from "@/lib/validate-checkout-request";

export const SHIPPING_QUOTE_ERRORS = {
  ZIP_REQUIRED: "ZIP_REQUIRED",
  SHIPPING_UNAVAILABLE: "SHIPPING_UNAVAILABLE",
} as const;

export type ShippingQuoteErrorCode =
  (typeof SHIPPING_QUOTE_ERRORS)[keyof typeof SHIPPING_QUOTE_ERRORS];

export class ShippingQuoteError extends Error {
  code: ShippingQuoteErrorCode;

  constructor(code: ShippingQuoteErrorCode, message: string) {
    super(message);
    this.name = "ShippingQuoteError";
    this.code = code;
  }
}

export type ShippingQuote = {
  shippingCost: number;
  boxCount: number;
  totalPacks: number;
  serviceName?: string;
};

export async function getShippingQuote(params: {
  zip?: string;
  isDeliver: boolean;
  items: NormalizedCheckoutItem[];
}): Promise<ShippingQuote> {
  const { zip, isDeliver, items } = params;

  if (!isDeliver) {
    return { shippingCost: 0, boxCount: 0, totalPacks: 0 };
  }

  if (!zip) {
    throw new ShippingQuoteError(
      SHIPPING_QUOTE_ERRORS.ZIP_REQUIRED,
      "ZIP code is required when delivery is selected."
    );
  }

  const { totalPacks, boxCount } = computeOrderPacks(items);
  const rates = await getShippingRates(zip);
  const oneBox = rates[0];

  if (!oneBox) {
    throw new ShippingQuoteError(
      SHIPPING_QUOTE_ERRORS.SHIPPING_UNAVAILABLE,
      "No shipping rate available for this ZIP code."
    );
  }

  const rawShipping = oneBox.shipmentCost * boxCount;
  const shippingCost = Math.round(rawShipping * 100) / 100;

  return {
    shippingCost,
    boxCount,
    totalPacks,
    serviceName: oneBox.serviceName,
  };
}
