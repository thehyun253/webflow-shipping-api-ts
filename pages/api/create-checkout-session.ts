import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getShippingRates } from "@/lib/shipping";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

// ✅
function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.thehyun.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(res); // ✅

  // ✅
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { zip, productPrice, shippingCost, shippingName } = req.body;

    if (!zip || typeof productPrice !== "number") {
      return res.status(400).json({ message: "Missing or invalid zip/productPrice" });
    }

    // ✅ shippingCost가 없으면 기본 배송비 조회 (선택 사항)
    let finalShippingCost = shippingCost;
    if (typeof finalShippingCost !== "number") {
      const rates = await getShippingRates(zip);
      if (!rates || rates.length === 0) {
        return res.status(500).json({ message: "Failed to get shipping cost" });
      }
      finalShippingCost = rates[0].shipmentCost;
    }

    // ✅ Stripe 결제 세션 생성
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Your Product",
              description: shippingName || "Standard Shipping",
            },
            unit_amount: Math.round((productPrice + finalShippingCost) * 100), // 단위: 센트
          },
          quantity: 1,
        },
      ],
      success_url: "https://thehyun.com/order-confirmation",
      cancel_url: "https://thehyun.com/checkout",
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error("❌ Stripe session creation failed:", error.message);
    res.status(500).json({ message: "Failed to create Stripe session" });
  }
}
