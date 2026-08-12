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
    apiVersion: "2025-06-30.basil",
  }
);

const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .end("Method Not Allowed");
  }

  let event: Stripe.Event;

  // Stripe signature verification
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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const eventSession =
          event.data
            .object as Stripe.Checkout.Session;

        // 최신 Checkout Session 다시 조회
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

        // 실제 결제 완료 여부 확인
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

        // THE HYUN 커스텀 checkout만 처리
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

        const lineItems =
          session.line_items?.data ??
          [];

        // 실제 상품만 추출
        // "Shipping" line은 제외
        const products =
          lineItems
            .filter((item) => {
              const product =
                typeof item.price
                  ?.product ===
                "object"
                  ? item.price
                      .product
                  : null;

              const name =
                product &&
                !(
                  "deleted" in
                    product &&
                  product.deleted
                ) &&
                "name" in product
                  ? product.name
                  : item.description ??
                    "";

              return name !== "Shipping";
            })
            .map((item) => {
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

              let description = "";

              if (
                product &&
                !(
                  "deleted" in
                    product &&
                  product.deleted
                )
              ) {
                if (
                  "name" in product
                ) {
                  productName =
                    product.name;
                }

                if (
                  "description" in
                  product
                ) {
                  description =
                    product.description ??
                    "";
                }
              }

              return {
                name:
                  productName,

                description,

                quantity:
                  item.quantity ?? 1,

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
            });

        const customer =
          session.customer_details;

        // shipping_address_collection으로
        // Checkout에서 받은 배송 주소 사용
        const shippingDetails =
          session.shipping_details;

        const shippingAddress =
          shippingDetails?.address ??
          customer?.address ??
          null;

        const shippingName =
          shippingDetails?.name ??
          customer?.name ??
          "";

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
              shippingName,

            email:
              customer?.email ??
              "",

            phone:
              customer?.phone ??
              "",
          },

          shippingAddress:
            shippingAddress
              ? {
                  line1:
                    shippingAddress.line1 ??
                    "",

                  line2:
                    shippingAddress.line2 ??
                    "",

                  city:
                    shippingAddress.city ??
                    "",

                  state:
                    shippingAddress.state ??
                    "",

                  postalCode:
                    shippingAddress.postal_code ??
                    "",

                  country:
                    shippingAddress.country ??
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

        /*
          다음 단계에서 연결:

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

    // Stripe가 재시도할 수 있도록 500 반환
    return res
      .status(500)
      .json({
        received: true,
        processed: false,
        error: message,
      });
  }
}
