// pages/api/create-checkout-session.ts

import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

import {
  buildProductLineItems,
  buildShippingLineItem,
} from "@/lib/build-checkout-line-items";

import {
  getShippingQuote,
  ShippingQuoteError,
  SHIPPING_QUOTE_ERRORS,
} from "@/lib/get-shipping-quote";

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
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://www.thehyun.com"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

function normalizeGiftMessage(body: any) {
  const enabled =
    body?.giftMessageEnabled === "yes"
      ? "yes"
      : "no";

  const rawMessage =
    typeof body?.giftMessageText === "string"
      ? body.giftMessageText
      : "";

  const message =
    enabled === "yes"
      ? rawMessage.trim()
      : "";

  return {
    giftMessageEnabled: enabled,
    giftMessageText: message,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      message: "Method Not Allowed",
    });
  }

  try {
    const parsed =
      validateCheckoutRequest(req.body);

    if (!parsed.ok) {
      return res.status(400).json({
        message:
          CHECKOUT_VALIDATION_ERROR_MESSAGE,
      });
    }

    const priceCheck =
      validateCheckoutPrices(parsed.data);

    if (!priceCheck.ok) {
      return res.status(400).json({
        message:
          CHECKOUT_VALIDATION_ERROR_MESSAGE,
      });
    }

    const {
      productPrice,
      isDeliver,
      zip,
      items,
    } = parsed.data;

    const {
      giftMessageEnabled,
      giftMessageText,
    } = normalizeGiftMessage(req.body);

    // ShipStation rate calculation
    const quote =
      await getShippingQuote({
        zip,
        isDeliver,
        items,
      });

    const finalShippingCost =
      quote.shippingCost;

    if (Number.isNaN(finalShippingCost)) {
      return res.status(500).json({
        message:
          PAYMENT_SERVER_ERROR_MESSAGE,
      });
    }

    // Stripe line items
    const lineItems:
      Stripe.Checkout.SessionCreateParams.LineItem[] =
      [
        ...buildProductLineItems(items),
      ];

    if (
      isDeliver &&
      finalShippingCost > 0
    ) {
      lineItems.push(
        buildShippingLineItem(
          finalShippingCost,
          quote.boxCount
        )
      );
    }

    // Checkout metadata
    const checkoutMetadata = {
      source: "webflow_checkout",

      is_deliver:
        isDeliver ? "true" : "false",

      item_count:
        String(items.length),

      box_count:
        String(
          isDeliver
            ? quote.boxCount
            : 0
        ),

      shipping_service:
        isDeliver
          ? quote.serviceName ?? ""
          : "",

      gift_message_enabled:
        giftMessageEnabled,

      gift_message:
        giftMessageText,
    };

    const session =
      await stripe.checkout.sessions.create({
        mode: "payment",

        payment_method_types: ["card"],

        line_items: lineItems,

        metadata:
          checkoutMetadata,

        payment_intent_data: {
          metadata:
            checkoutMetadata,
        },


        // 고객 전화번호 수집
        phone_number_collection: {
          enabled: true,
        },

        success_url:
          "https://thehyun.com/order-confirmation?session_id={CHECKOUT_SESSION_ID}",

        cancel_url:
          "https://thehyun.com/checkout",
      });

    console.log(
      "[checkout] ok",
      isDeliver
        ? {
            shipping:
              finalShippingCost,
            boxes:
              quote.boxCount,
            packs:
              quote.totalPacks,
            carrierService:
              quote.serviceName ?? "",
            giftMessageEnabled,
            hasGiftMessage:
              giftMessageText.length > 0,
          }
        : {
            pickup: true,
            productPrice,
            giftMessageEnabled,
            hasGiftMessage:
              giftMessageText.length > 0,
          }
    );

    return res.status(200).json({
      url: session.url,

      debug: {
        zip:
          zip ?? null,

        productPrice,

        isDeliver,

        itemCount:
          items.length,

        sumCents:
          priceCheck.sumCents,

        ...(isDeliver
          ? {
              totalPacks:
                quote.totalPacks,

              boxCount:
                quote.boxCount,

              shippingService:
                quote.serviceName ?? "",
            }
          : {}),

        finalShippingCost,

        total:
          productPrice +
          finalShippingCost,

        giftMessageEnabled,

        giftMessageText,
      },
    });
  } catch (error: unknown) {
    if (
      error instanceof
        ShippingQuoteError &&
      error.code ===
        SHIPPING_QUOTE_ERRORS.SHIPPING_UNAVAILABLE
    ) {
      return res.status(422).json({
        message:
          SHIPPING_UNAVAILABLE_MESSAGE,
      });
    }

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "Stripe session creation failed:",
      message
    );

    return res.status(500).json({
      message:
        PAYMENT_SERVER_ERROR_MESSAGE,
    });
  }
}
