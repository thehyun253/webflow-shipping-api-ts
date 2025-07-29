import type { NextApiRequest, NextApiResponse } from "next";
import { getShippingRates } from "@/lib/shipping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { zip } = req.body;
  if (!zip) {
    return res.status(400).json({ message: "Missing zip code" });
  }

  try {
    const rates = await getShippingRates(zip);
    res.status(200).json(rates);
  } catch (error: any) {
    console.error("Shipping rate fetch error:", error.message);
    res.status(500).json({ message: "Failed to fetch shipping rates" });
  }
}
