import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getShippingRates } from "@/lib/shipping"; // ✅ 2단계에서 만든 함수

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2022-11-15",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { zip, productPrice } = req.body;

    if (!zip || !productPrice) {
      return res.status(400).json({ message: "Missing zip or productPrice" });
    }

    // ✅ ShipStation에서 배송비 가져오기
    const rates = await getShippingRates(zip);

    if (!rates || rates.length === 0) {
      return res.status(500).json({ message: "Failed to get shipping cost" });
    }

    // 가장 저렴한 배송 옵션 선택
    const shippingCost = rates[0].shipmentCost;

    // Stripe 결제 세션 생성
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Your Product",
            },
            unit_amount: Math.round((productPrice + shippingCost) * 100), // 배송비 포함
          },
          quantity: 1,
        },
      ],
      success_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe session creation failed:", error.message);
    res.status(500).json({ message: "Failed to get shipping cost" });
  }
}
