import type Stripe from "stripe";
import type { NormalizedCheckoutItem } from "@/lib/validate-checkout-request";
import { toCents } from "@/lib/validate-checkout-prices";

function productDataForItem(item: NormalizedCheckoutItem): Stripe.Checkout.SessionCreateParams.LineItem.PriceData.ProductData {
  const base: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.ProductData = {
    name: item.name,
  };
  if (item.weight !== false) {
    base.description = `Weight: ${item.weight}`;
  }
  return base;
}

export function buildProductLineItems(
  items: NormalizedCheckoutItem[]
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const out: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const item of items) {
    const lineCents = toCents(item.price);
    const q = item.quantity;
    const unitAmount = Math.floor(lineCents / q);
    const remainder = lineCents - unitAmount * q;

    if (unitAmount < 1 && lineCents > 0) {
      out.push({
        price_data: {
          currency: "usd",
          product_data: {
            ...productDataForItem(item),
            description:
              item.weight !== false
                ? `Weight: ${item.weight} (qty ${q})`
                : `qty ${q}`,
          },
          unit_amount: lineCents,
        },
        quantity: 1,
      });
      continue;
    }

    out.push({
      price_data: {
        currency: "usd",
        product_data: productDataForItem(item),
        unit_amount: unitAmount,
      },
      quantity: q,
    });

    if (remainder > 0) {
      out.push({
        price_data: {
          currency: "usd",
          product_data: {
            ...productDataForItem(item),
            name: `${item.name} (remainder)`,
          },
          unit_amount: remainder,
        },
        quantity: 1,
      });
    }
  }

  return out;
}

export function buildShippingLineItem(
  finalShippingCost: number,
  serviceName: string
): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: serviceName || "Shipping",
      },
      unit_amount: Math.round(finalShippingCost * 100),
    },
    quantity: 1,
  };
}
