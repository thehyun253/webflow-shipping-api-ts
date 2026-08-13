// pages/api/create-checkout-session.ts

import type {
  NextApiRequest,
  NextApiResponse,
} from "next";
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

import {
  validateCheckoutPrices,
} from "@/lib/validate-checkout-prices";

import {
  CHECKOUT_VALIDATION_ERROR_MESSAGE,
  PAYMENT_SERVER_ERROR_MESSAGE,
  SHIPPING_UNAVAILABLE_MESSAGE,
  validateCheckoutRequest,
} from "@/lib/validate-checkout-request";

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!,
  {
    apiVersion: "2025-06-30.basil",
  }
);

// =====================================================
// CORS
// =====================================================

function setCors(
  res: NextApiResponse
) {
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

// =====================================================
// 문자열 안전하게 가져오기
// =====================================================

function cleanString(
  value: unknown
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

// =====================================================
// Gift Message
// =====================================================

function normalizeGiftMessage(
  body: any
) {
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

// =====================================================
// Webflow 배송주소 읽기
//
// 여러 형태의 field name을 지원하도록 만들어 놓음.
// 기존 Webflow 코드의 이름이 조금 달라도 최대한 잡도록 함.
// =====================================================

function normalizeShippingInfo(
  body: any
) {
  const shipping =
    body?.shippingAddress ??
    body?.shipping_address ??
    body?.address ??
    {};

  const name =
    cleanString(
      body?.shippingName ??
      body?.customerName ??
      body?.fullName ??
      shipping?.name ??
      body?.name
    );

  const line1 =
    cleanString(
      shipping?.line1 ??
      shipping?.street1 ??
      shipping?.address1 ??
      body?.shippingLine1 ??
      body?.shippingAddress1 ??
      body?.address1 ??
      body?.street1
    );

  const line2 =
    cleanString(
      shipping?.line2 ??
      shipping?.street2 ??
      shipping?.address2 ??
      body?.shippingLine2 ??
      body?.shippingAddress2 ??
      body?.address2 ??
      body?.street2
    );

  const city =
    cleanString(
      shipping?.city ??
      body?.shippingCity ??
      body?.city
    );

  const state =
    cleanString(
      shipping?.state ??
      body?.shippingState ??
      body?.state
    );

  const postalCode =
    cleanString(
      shipping?.postalCode ??
      shipping?.postal_code ??
      shipping?.zip ??
      body?.shippingZip ??
      body?.postalCode ??
      body?.postal_code ??
      body?.zip
    );

  const country =
    cleanString(
      shipping?.country ??
      body?.shippingCountry ??
      body?.country ??
      "US"
    ) || "US";

  const email =
    cleanString(
      body?.email ??
      body?.customerEmail ??
      shipping?.email
    );

  const phone =
    cleanString(
      body?.phone ??
      body?.customerPhone ??
      shipping?.phone
    );

  return {
    name,
    line1,
    line2,
    city,
    state,
    postalCode,
    country,
    email,
    phone,
  };
}

// =====================================================
// API Handler
// =====================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({
        message: "Method Not Allowed",
      });
  }

  try {
    // =================================================
    // 기존 checkout validation
    // =================================================

    const parsed =
      validateCheckoutRequest(
        req.body
      );

    if (!parsed.ok) {
      return res
        .status(400)
        .json({
          message:
            CHECKOUT_VALIDATION_ERROR_MESSAGE,
        });
    }

    const priceCheck =
      validateCheckoutPrices(
        parsed.data
      );

    if (!priceCheck.ok) {
      return res
        .status(400)
        .json({
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

    // =================================================
    // Gift Message
    // =================================================

    const {
      giftMessageEnabled,
      giftMessageText,
    } = normalizeGiftMessage(
      req.body
    );

    // =================================================
    // Webflow에서 입력한 배송주소
    // =================================================

    const shippingInfo =
      normalizeShippingInfo(
        req.body
      );

    console.log(
      "[checkout] Webflow shipping info:",
      JSON.stringify(
        shippingInfo,
        null,
        2
      )
    );

    // =================================================
    // ShipStation 배송비 계산
    // =================================================

    const quote =
      await getShippingQuote({
        zip,
        isDeliver,
        items,
      });

    const finalShippingCost =
      quote.shippingCost;

    if (
      Number.isNaN(
        finalShippingCost
      )
    ) {
      return res
        .status(500)
        .json({
          message:
            PAYMENT_SERVER_ERROR_MESSAGE,
        });
    }

    // =================================================
    // Stripe Line Items
    // =================================================

    const lineItems = [
      ...buildProductLineItems(
        items
      ),
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

    // =================================================
    // Stripe Metadata
    //
    // Webflow 배송주소를 여기 저장.
    // Stripe Checkout에서는 배송주소를 다시 안 물어봄.
    // =================================================

    const checkoutMetadata = {
      source:
        "webflow_checkout",

      is_deliver:
        isDeliver
          ? "true"
          : "false",

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

      // ===============================================
      // Webflow Shipping Information
      // ===============================================

      shipping_name:
        shippingInfo.name,

      shipping_line1:
        shippingInfo.line1,

      shipping_line2:
        shippingInfo.line2,

      shipping_city:
        shippingInfo.city,

      shipping_state:
        shippingInfo.state,

      shipping_postal_code:
        shippingInfo.postalCode,

      shipping_country:
        shippingInfo.country,

      webflow_email:
        shippingInfo.email,

      webflow_phone:
        shippingInfo.phone,
    };

    // =================================================
    // Stripe Checkout Session 생성
    // =================================================

    const session =
      await stripe.checkout.sessions.create({
        mode: "payment",

        payment_method_types: [
          "card",
        ],

        line_items:
          lineItems,

        metadata:
          checkoutMetadata,

        payment_intent_data: {
          metadata:
            checkoutMetadata,
        },

        // ===============================================
        // 중요:
        //
        // shipping_address_collection 없음.
        //
        // 따라서 Stripe Checkout 페이지에서
        // 배송주소를 다시 입력하지 않음.
        // ===============================================

        phone_number_collection: {
          enabled: true,
        },

        success_url:
          "https://thehyun.com/order-confirmation?session_id={CHECKOUT_SESSION_ID}",

        cancel_url:
          "https://thehyun.com/checkout",
      });

    // =================================================
    // Debug
    // =================================================

    console.log(
      "[checkout] ok",
      {
        sessionId:
          session.id,

        isDeliver,

        zip,

        productPrice,

        shippingCost:
          finalShippingCost,

        boxCount:
          quote.boxCount,

        totalPacks:
          quote.totalPacks,

        shippingService:
          quote.serviceName,

        shippingAddress:
          shippingInfo,
      }
    );

    return res
      .status(200)
      .json({
        url:
          session.url,

        debug: {
          shippingCost:
            finalShippingCost,

          boxCount:
            quote.boxCount,

          totalPacks:
            quote.totalPacks,

          shippingService:
            quote.serviceName,
        },
      });
  } catch (err: unknown) {
    // =================================================
    // Shipping Quote Error
    // =================================================

    if (
      err instanceof
      ShippingQuoteError
    ) {
      if (
        err.code ===
        SHIPPING_QUOTE_ERRORS
          .SHIPPING_UNAVAILABLE
      ) {
        return res
          .status(422)
          .json({
            message:
              SHIPPING_UNAVAILABLE_MESSAGE,
          });
      }

      if (
        err.code ===
        SHIPPING_QUOTE_ERRORS
          .ZIP_REQUIRED
      ) {
        return res
          .status(400)
          .json({
            message:
              CHECKOUT_VALIDATION_ERROR_MESSAGE,
          });
      }
    }

    // =================================================
    // 기타 오류
    // =================================================

    const message =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(
      "[checkout] failed:",
      message
    );

    return res
      .status(500)
      .json({
        message:
          PAYMENT_SERVER_ERROR_MESSAGE,
      });
  }
}
