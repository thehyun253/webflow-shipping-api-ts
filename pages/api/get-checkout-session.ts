// pages/api/get-checkout-session.ts

import type {
  NextApiRequest,
  NextApiResponse,
} from "next";
import Stripe from "stripe";

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!,
  {
    apiVersion: "2025-06-30.basil",
  }
);

function setCors(res: NextApiResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://www.thehyun.com"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

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
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res
      .status(405)
      .json({
        message: "Method Not Allowed",
      });
  }

  try {
    const sessionId =
      typeof req.query.session_id === "string"
        ? req.query.session_id
        : "";

    if (
      !sessionId ||
      !sessionId.startsWith("cs_")
    ) {
      return res
        .status(400)
        .json({
          message: "Invalid session ID",
        });
    }

    const session =
      await stripe.checkout.sessions.retrieve(
        sessionId,
        {
          expand: [
            "line_items",
            "line_items.data.price.product",
            "payment_intent",
          ],
        }
      );

    if (
      session.payment_status !== "paid"
    ) {
      return res
        .status(403)
        .json({
          message: "Payment not completed",
        });
    }

    const metadata =
      session.metadata ?? {};

    if (
      metadata.source !==
      "webflow_checkout"
    ) {
      return res
        .status(403)
        .json({
          message: "Invalid checkout source",
        });
    }

    const customer =
      session.customer_details;

    const lineItems =
      session.line_items?.data ?? [];

    let shippingAmount = 0;

    const products = lineItems
      .filter((item) => {
        const product =
          typeof item.price?.product ===
          "object"
            ? item.price.product
            : null;

        const name =
          product &&
          !(
            "deleted" in product &&
            product.deleted
          ) &&
          "name" in product
            ? product.name
            : item.description ?? "";

        if (name === "Shipping") {
          shippingAmount +=
            item.amount_total ?? 0;

          return false;
        }

        return true;
      })
      .map((item) => {
        const product =
          typeof item.price?.product ===
          "object"
            ? item.price.product
            : null;

        let name =
          item.description ?? "Item";

        let description = "";

        if (
          product &&
          !(
            "deleted" in product &&
            product.deleted
          )
        ) {
          if ("name" in product) {
            name = product.name;
          }

          if ("description" in product) {
            description =
              product.description ?? "";
          }
        }

        return {
          name,
          description,
          quantity:
            item.quantity ?? 1,
          amount:
            item.amount_total ?? 0,
        };
      });

    const address = {
      name:
        clean(metadata.shipping_name) ||
        clean(customer?.name),

      line1:
        clean(metadata.shipping_line1),

      line2:
        clean(metadata.shipping_line2),

      city:
        clean(metadata.shipping_city),

      state:
        clean(metadata.shipping_state),

      postalCode:
        clean(
          metadata.shipping_postal_code
        ),

      country:
        clean(
          metadata.shipping_country
        ) || "US",
    };

    const email =
      clean(customer?.email) ||
      clean(metadata.webflow_email);

    const phone =
      clean(customer?.phone) ||
      clean(metadata.webflow_phone);

    const total =
      session.amount_total ?? 0;

    const subtotal =
      Math.max(
        0,
        total - shippingAmount
      );

    return res
      .status(200)
      .json({
        success: true,

        sessionId:
          session.id,

        paymentStatus:
          session.payment_status,

        email,
        phone,

        isDelivery:
          metadata.is_deliver === "true",

        shippingAddress:
          address,

        shippingService:
          metadata.shipping_service ||
          "FedEx Priority Overnight",

        boxCount:
          Number(
            metadata.box_count ?? "0"
          ),

        giftMessage:
          metadata.gift_message ?? "",

        products,

        subtotal,
        shipping:
          shippingAmount,
        total,

        currency:
          session.currency ?? "usd",
      });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(
      "[get-checkout-session] failed:",
      message
    );

    return res
      .status(500)
      .json({
        message:
          "Unable to retrieve order.",
      });
  }
}
