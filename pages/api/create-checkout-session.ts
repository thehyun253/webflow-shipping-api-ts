import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { buildProductLineItems, buildShippingLineItem } from "@/lib/build-checkout-line-items";
import { getShippingQuote, ShippingQuoteError, SHIPPING_QUOTE_ERRORS } from "@/lib/get-shipping-quote";
import { validateCheckoutPrices } from "@/lib/validate-checkout-prices";
import {
  CHECKOUT_VALIDATION_ERROR_MESSAGE,
  PAYMENT_SERVER_ERROR_MESSAGE,
  SHIPPING_UNAVAILABLE_MESSAGE,
  validateCheckoutRequest,
} from "@/lib/validate-checkout-request";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.thehyun.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const parsed = validateCheckoutRequest(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ message: CHECKOUT_VALIDATION_ERROR_MESSAGE });
    }

    const priceCheck = validateCheckoutPrices(parsed.data);
    if (!priceCheck.ok) {
      return res.status(400).json({ message: CHECKOUT_VALIDATION_ERROR_MESSAGE });
    }

    const { productPrice, isDeliver, zip, items } = parsed.data;

    const quote = await getShippingQuote({ zip, isDeliver, items });
    const finalShippingCost = quote.shippingCost;

    if (Number.isNaN(finalShippingCost)) {
      return res.status(500).json({ message: PAYMENT_SERVER_ERROR_MESSAGE });
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      ...buildProductLineItems(items),
    ];
    if (isDeliver && finalShippingCost > 0) {
      lineItems.push(buildShippingLineItem(finalShippingCost, quote.boxCount));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      metadata: {
        source: "webflow_checkout",
        is_deliver: isDeliver ? "true" : "false",
        item_count: String(items.length),
        box_count: String(isDeliver ? quote.boxCount : 0),
      },
      success_url: "https://thehyun.com/order-confirmation",
      cancel_url: "https://thehyun.com/checkout",
    });

    console.log(
      "[checkout] ok",
      isDeliver
        ? {
            shipping: finalShippingCost,
            boxes: quote.boxCount,
            packs: quote.totalPacks,
            ...(quote.serviceName ? { carrierService: quote.serviceName } : {}),
          }
        : { pickup: true, productPrice }
    );

    res.status(200).json({
      url: session.url,
      debug: {
        zip: zip ?? null,
        productPrice,
        isDeliver,
        itemCount: items.length,
        sumCents: priceCheck.sumCents,
        ...(isDeliver
          ? {
              totalPacks: quote.totalPacks,
              boxCount: quote.boxCount,
            }
          : {}),
        finalShippingCost,
        total: productPrice + finalShippingCost,
      },
    });
  } catch (error: unknown) {
    if (
      error instanceof ShippingQuoteError &&
      error.code === SHIPPING_QUOTE_ERRORS.SHIPPING_UNAVAILABLE
    ) {
      return res.status(422).json({ message: SHIPPING_UNAVAILABLE_MESSAGE });
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("Stripe session creation failed:", message);
    res.status(500).json({ message: PAYMENT_SERVER_ERROR_MESSAGE });
  }
}
