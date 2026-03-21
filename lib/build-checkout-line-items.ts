import type Stripe from "stripe";
import type { NormalizedCheckoutItem, NormalizedWeight } from "@/lib/validate-checkout-request";
import { toCents } from "@/lib/validate-checkout-prices";

/** rules.md §7·§8: `Qty` 필수, Weight 있으면 `Weight · Qty` 한 줄. */
function productDescriptionForLine(weight: NormalizedWeight, qty: number): string {
  const qtyPart = `Qty: ${qty}`;
  if (weight === false) return qtyPart;
  return `Weight: ${weight} · ${qtyPart}`;
}

function productDataForItem(
  item: NormalizedCheckoutItem,
  qtyForDescription: number
): Stripe.Checkout.SessionCreateParams.LineItem.PriceData.ProductData {
  return {
    name: item.name,
    description: productDescriptionForLine(item.weight, qtyForDescription),
  };
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
          product_data: productDataForItem(item, q),
          unit_amount: lineCents,
        },
        quantity: 1,
      });
      continue;
    }

    out.push({
      price_data: {
        currency: "usd",
        product_data: productDataForItem(item, q),
        unit_amount: unitAmount,
      },
      quantity: q,
    });

    if (remainder > 0) {
      out.push({
        price_data: {
          currency: "usd",
          product_data: {
            ...productDataForItem(item, q),
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
  boxCount: number
): Stripe.Checkout.SessionCreateParams.LineItem {
  const boxes = Math.max(1, boxCount);
  const description =
    boxes === 1 ? "Ships in 1 box" : `Ships in ${boxes} boxes`;

  return {
    price_data: {
      currency: "usd",
      product_data: {
        name: "Shipping",
        description,
      },
      unit_amount: Math.round(finalShippingCost * 100),
    },
    quantity: 1,
  };
}
