import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { computeOrderPacks } from "@/lib/compute-order-packs";
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
      return res.status(400).json({ message: CHECKOUT_VALIDATION_ERROR_MESSAGE });
    }

    const priceCheck = validateCheckoutPrices(parsed.data);
    if (!priceCheck.ok) {
      return res.status(400).json({ message: CHECKOUT_VALIDATION_ERROR_MESSAGE });
    }

    const { productPrice, isDeliver, zip, items } = parsed.data;

    let packMeta = { totalPacks: 0, boxCount: 0 };
    let finalShippingCost: number;
    let finalShippingName: string | undefined;

    if (!isDeliver) {
      finalShippingCost = 0;
      finalShippingName = undefined;
    } else {
      packMeta = computeOrderPacks(items);
      const rates = await getShippingRates(zip!);

      if (!rates || rates.length === 0) {
        console.log("[checkout] no rate", zip);
        return res.status(422).json({
          message: SHIPPING_UNAVAILABLE_MESSAGE,
        });
      }

      const oneBox = rates[0];
      const rawShipping = oneBox.shipmentCost * packMeta.boxCount;
      finalShippingCost = Math.round(rawShipping * 100) / 100;
      finalShippingName = oneBox.serviceName;
    }

    if (Number.isNaN(finalShippingCost)) {
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

    console.log(
      "[checkout] ok",
      isDeliver
        ? {
            shipping: finalShippingCost,
            boxes: packMeta.boxCount,
            packs: packMeta.totalPacks,
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
              totalPacks: packMeta.totalPacks,
              boxCount: packMeta.boxCount,
            }
          : {}),
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
