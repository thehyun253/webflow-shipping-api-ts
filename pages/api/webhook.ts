// pages/api/webhook.ts

import { buffer } from "micro";
import type {
  NextApiRequest,
  NextApiResponse,
} from "next";
import Stripe from "stripe";

import {
  createShipStationOrder,
} from "@/lib/create-shipstation-order";

import {
  sendOrderEmails,
} from "@/lib/send-order-emails";

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

function clean(
  value: string | null | undefined
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

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

  // =====================================================
  // Stripe Signature
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
  // Event
  // =====================================================

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const eventSession =
          event.data
            .object as Stripe.Checkout.Session;

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

        if (
          session.payment_status !==
          "paid"
        ) {
          console.log(
            "[webhook] Payment not paid:",
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
        // Products
        // =================================================

        const lineItems =
          session.line_items?.data ??
          [];

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

              return (
                name !== "Shipping"
              );
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

              let description =
                "";

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
            });

        // =================================================
        // Customer
        // =================================================

        const customer =
          session.customer_details;

        const stripeShipping =
          session
            .collected_information
            ?.shipping_details;

        const shippingName =
          clean(
            metadata.shipping_name
          ) ||
          clean(
            stripeShipping?.name
          ) ||
          clean(
            customer?.name
          );

        const metadataAddress = {
          line1:
            clean(
              metadata.shipping_line1
            ),

          line2:
            clean(
              metadata.shipping_line2
            ),

          city:
            clean(
              metadata.shipping_city
            ),

          state:
            clean(
              metadata.shipping_state
            ),

          postalCode:
            clean(
              metadata.shipping_postal_code
            ),

          country:
            clean(
              metadata.shipping_country
            ) || "US",
        };

        const hasWebflowAddress =
          Boolean(
            metadataAddress.line1 ||
            metadataAddress.city ||
            metadataAddress.postalCode
          );

        let shippingAddress:
          | {
              line1: string;
              line2: string;
              city: string;
              state: string;
              postalCode: string;
              country: string;
            }
          | null = null;

        if (
          hasWebflowAddress
        ) {
          shippingAddress =
            metadataAddress;
        } else if (
          stripeShipping
            ?.address
        ) {
          shippingAddress = {
            line1:
              stripeShipping
                .address.line1 ??
              "",

            line2:
              stripeShipping
                .address.line2 ??
              "",

            city:
              stripeShipping
                .address.city ??
              "",

            state:
              stripeShipping
                .address.state ??
              "",

            postalCode:
              stripeShipping
                .address
                .postal_code ??
              "",

            country:
              stripeShipping
                .address.country ??
              "US",
          };
        } else if (
          customer?.address
        ) {
          shippingAddress = {
            line1:
              customer.address
                .line1 ?? "",

            line2:
              customer.address
                .line2 ?? "",

            city:
              customer.address
                .city ?? "",

            state:
              customer.address
                .state ?? "",

            postalCode:
              customer.address
                .postal_code ?? "",

            country:
              customer.address
                .country ?? "US",
          };
        }

        const customerEmail =
          clean(
            customer?.email
          ) ||
          clean(
            metadata.webflow_email
          );

        const customerPhone =
          clean(
            customer?.phone
          ) ||
          clean(
            metadata.webflow_phone
          );

        // =================================================
        // Order
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
                  ?.id ?? null,

          customer: {
            name:
              shippingName,

            email:
              customerEmail,

            phone:
              customerPhone,
          },

          shippingAddress,

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
        // ShipStation
        // =================================================

        if (
          order.isDelivery
        ) {
          if (
            !order.shippingAddress
          ) {
            throw new Error(
              "Delivery order is missing shipping address."
            );
          }

          const shipStationResult =
            await createShipStationOrder(
              order
            );

          console.log(
            "[webhook] SHIPSTATION COMPLETE",
            JSON.stringify(
              shipStationResult,
              null,
              2
            )
          );
        } else {
          console.log(
            "[webhook] Pickup order - ShipStation skipped"
          );
        }

        // =================================================
        // Customer + Admin Email
        // =================================================

        const emailResult =
          await sendOrderEmails(
            order
          );

        console.log(
          "[webhook] EMAILS COMPLETE",
          JSON.stringify(
            emailResult,
            null,
            2
          )
        );

        // =================================================
        // Success
        // =================================================

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

    return res
      .status(500)
      .json({
        received: true,
        processed: false,
        error:
          message,
      });
  }
}
