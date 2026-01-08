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
    let finalShippingName = shippingName;

    if (typeof finalShippingCost !== "number") {
      const rates = await getShippingRates(zip);
      
      // 잘못된 금액 결제 방지: rates가 비는 경우
      if (!rates || rates.length === 0) {
        return res.status(422).json({
          message:
            "No eligible FedEx Overnight rates found for this ZIP. Please verify the address/ZIP or contact support.",
        });
      }

      // Priority Overnight 우선, 없으면 첫 번째 값 사용
      const preferred =
        rates.find((r: any) => r.serviceCode === "fedex_priority_overnight") ?? rates[0];

      finalShippingCost = preferred.shipmentCost;
      finalShippingName = preferred.serviceName;
    }

    // 혹시라도 숫자가 아니면 중단(Stripe 에러 예방)
    if (typeof finalShippingCost !== "number" || Number.isNaN(finalShippingCost)) {
      return res.status(500).json({ message: "Failed to resolve shipping cost" });
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
