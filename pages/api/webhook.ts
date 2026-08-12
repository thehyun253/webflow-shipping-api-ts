// pages/api/webhook.ts

import { buffer } from "micro";
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";

import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!,
  {
    apiVersion:
      "2025-06-30.basil",
  }
);

const webhookSecret =
  process.env
    .STRIPE_WEBHOOK_SECRET!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // =====================================================
  // 1. POST만 허용
  // =====================================================

  if (req.method !== "POST") {
    return res
      .status(405)
      .end("Method Not Allowed");
  }

  let event: Stripe.Event;

  // =====================================================
  // 2. Stripe signature 검증
  // =====================================================

  try {
    const rawBody =
      await buffer(req);

    const sig =
      req.headers[
        "stripe-signature"
      ];

    if (
      !sig ||
      Array.isArray(sig)
    ) {
      return res
        .status(400)
        .send(
          "Missing Stripe signature"
        );
    }

    event =
      stripe.webhooks.constructEvent(
        rawBody,
        sig,
        webhookSecret
      );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(
      "[webhook] Stripe signature verification failed:",
      message
    );

    return res
      .status(400)
      .send(
        `Webhook Error: ${message}`
      );
  }

  // =====================================================
  // 3. Stripe Event 처리
  // =====================================================

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const eventSession =
          event.data
            .object as Stripe.Checkout.Session;

        // =================================================
        // 최신 Session 재조회
        // =================================================

        const session =
          await stripe.checkout.sessions.retrieve(
            eventSession.id,
            {
              expand: [
                "line_items",
                "line_items.data.price.product",
                "payment_intent",
              ],
            }
          );

        // Stripe 공식 fulfillment 흐름:
        // 실제 payment_status 확인
        if (
          session.payment_status !==
          "paid"
        ) {
          console.log(
            "[webhook] Session completed but payment not paid:",
            session.id,
            session.payment_status
          );

          return res
            .status(200)
            .json({
              received: true,
              processed: false,
              reason:
                "payment_not_paid",
            });
        }

        const metadata =
          session.metadata ?? {};

        // =================================================
        // THE HYUN 커스텀 checkout만 처리
        // =================================================

        if (
          metadata.source !==
          "webflow_checkout"
        ) {
          console.log(
            "[webhook] Ignored non-custom checkout:",
            session.id
          );

          return res
            .status(200)
            .json({
              received: true,
              processed: false,
              reason:
                "not_webflow_checkout",
            });
        }

        // =================================================
        // Line Items
        // =================================================

        const lineItems =
          session.line_items?.data ??
          [];

        const products =
          lineItems.map(
            (item) => {
              const product =
                typeof item.price
                  ?.product ===
                "object"
                  ? item.price
                      .product
                  : null;

              let productName =
                item.description ??
                "Item";

              if (
                product &&
                !(
                  "deleted" in
                    product &&
                  product.deleted
                ) &&
                "name" in product
              ) {
                productName =
                  product.name;
              }

              return {
                name:
                  productName,

                quantity:
                  item.quantity ??
                  1,

                amountSubtotal:
                  item.amount_subtotal ??
                  0,

                amountTotal:
                  item.amount_total ??
                  0,

                currency:
                  item.currency ??
                  session.currency ??
                  "usd",
              };
            }
          );

        // =================================================
        // Customer
        // =================================================

        const customer =
          session.customer_details;

        /*
          shipping_address_collection을
          사용했기 때문에 Stripe Checkout에서
          수집된 주소가 customer_details.address에도
          들어오는지 로그에서 확인.

          Stripe API 버전에 따라 shipping_details /
          collected_information 구조를 별도로 활용할
          수 있으므로 아래에서는 우선
          customer_details.address를 사용.
        */

        const address =
          customer?.address ??
          null;

        // =================================================
        // Order 객체
        // =================================================

        const order = {
          stripeSessionId:
            session.id,

          paymentIntentId:
            typeof session.payment_intent ===
            "string"
              ? session.payment_intent
              : session
                    .payment_intent
                    ?.id ??
                null,

          customer: {
            name:
              customer?.name ??
              "",

            email:
              customer?.email ??
              "",

            phone:
              customer?.phone ??
              "",
          },

          shippingAddress:
            address
              ? {
                  line1:
                    address.line1 ??
                    "",

                  line2:
                    address.line2 ??
                    "",

                  city:
                    address.city ??
                    "",

                  state:
                    address.state ??
                    "",

                  postalCode:
                    address.postal_code ??
                    "",

                  country:
                    address.country ??
                    "",
                }
              : null,

          amountSubtotal:
            session.amount_subtotal ??
            0,

          amountTotal:
            session.amount_total ??
            0,

          currency:
            session.currency ??
            "usd",

          isDelivery:
            metadata.is_deliver ===
            "true",

          boxCount:
            Number(
              metadata.box_count ??
                "0"
            ),

          itemCount:
            Number(
              metadata.item_count ??
                "0"
            ),

          shippingService:
            metadata.shipping_service ??
            "",

          giftMessageEnabled:
            metadata.gift_message_enabled ===
            "yes",

          giftMessage:
            metadata.gift_message ??
            "",

          products,
        };

        console.log(
          "[webhook] ORDER READY",
          JSON.stringify(
            order,
            null,
            2
          )
        );

        // =================================================
        // 다음 단계
        // =================================================

        /*
        await createShipStationOrder(order);

        await sendCustomerConfirmation(order);

        await sendAdminNotification(order);
        */

        return res
          .status(200)
          .json({
            received: true,
            processed: true,
            sessionId:
              session.id,
          });
      }

      default: {
        console.log(
          `[webhook] Unhandled event type: ${event.type}`
        );

        return res
          .status(200)
          .json({
            received: true,
            processed: false,
          });
      }
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(
      "[webhook] Processing failed:",
      message
    );

    // 처리 실패 시 Stripe가 재시도하도록 500
    return res
      .status(500)
      .json({
        received: true,
        processed: false,
        error: message,
      });
  }
}
