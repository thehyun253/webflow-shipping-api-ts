import type { NextApiRequest, NextApiResponse } from "next";
import { getShippingRates } from "@/lib/shipping";

function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.thehyun.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { zip } = req.body;
  if (!zip) {
    return res.status(400).json({ message: "Missing zip code" });
  }

  try {
    const rates = await getShippingRates(zip);
    return res.status(200).json(rates);
  } catch (error: any) {
    console.error("Shipping rate fetch error:", error.message);
    return res.status(500).json({ message: "Failed to fetch shipping rates" });
  }
}