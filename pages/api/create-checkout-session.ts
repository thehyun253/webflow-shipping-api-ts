import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getShippingRates } from "@/lib/shipping";
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
      console.log("[checkout] request validation failed");
      return res.status(400).json({ message: CHECKOUT_VALIDATION_ERROR_MESSAGE });
    }

    const priceCheck = validateCheckoutPrices(parsed.data);
    if (!priceCheck.ok) {
      console.log("[checkout] price validation failed");
      return res.status(400).json({ message: CHECKOUT_VALIDATION_ERROR_MESSAGE });
    }

    const { productPrice, isDeliver, zip, items } = parsed.data;
    const { shippingCost, shippingName } = req.body as {
      shippingCost?: unknown;
      shippingName?: unknown;
    };

    let finalShippingCost: number | undefined = typeof shippingCost === "number" && !Number.isNaN(shippingCost)
      ? shippingCost
      : undefined;
    let finalShippingName =
      typeof shippingName === "string" ? shippingName : undefined;

    if (!isDeliver) {
      finalShippingCost = 0;
      finalShippingName = undefined;
    } else if (typeof finalShippingCost !== "number") {
      const rates = await getShippingRates(zip!);

      if (!rates || rates.length === 0) {
        console.log("[checkout] no rates for zip", zip);
        return res.status(422).json({
          message: SHIPPING_UNAVAILABLE_MESSAGE,
        });
      }

      const preferred =
        rates.find((r: { serviceCode?: string }) => r.serviceCode === "fedex_priority_overnight") ??
        rates[0];

      finalShippingCost = preferred.shipmentCost;
      finalShippingName = preferred.serviceName;
    }

    if (typeof finalShippingCost !== "number" || Number.isNaN(finalShippingCost)) {
      return res.status(500).json({ message: PAYMENT_SERVER_ERROR_MESSAGE });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Your Product",
              ...(isDeliver && finalShippingName
                ? { description: finalShippingName }
                : {}),
            },
            unit_amount: Math.round((productPrice + finalShippingCost) * 100),
          },
          quantity: 1,
        },
      ],

      success_url: "https://thehyun.com/order-confirmation",
      cancel_url: "https://thehyun.com/checkout",
    });

    console.log("[checkout] ok", {
      isDeliver,
      productPrice,
      shipping: finalShippingCost,
      lines: items.length,
    });

    res.status(200).json({
      url: session.url,
      debug: {
        zip: zip ?? null,
        productPrice,
        isDeliver,
        itemCount: items.length,
        sumCents: priceCheck.sumCents,
        finalShippingCost,
        total: productPrice + finalShippingCost,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Stripe session creation failed:", message);
    res.status(500).json({ message: PAYMENT_SERVER_ERROR_MESSAGE });
  }
}
