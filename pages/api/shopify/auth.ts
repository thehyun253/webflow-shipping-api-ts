import type { NextApiRequest, NextApiResponse } from "next";

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || "read_shipping,write_shipping";
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const HOST_URL = "https://shipping.thehyun.com";

function normalizeShop(shop: string | string[] | undefined): string {
  const rawShop = Array.isArray(shop) ? shop[0] : shop;

  return String(rawShop || SHOPIFY_SHOP || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!SHOPIFY_CLIENT_ID) {
    return res.status(500).send("Missing SHOPIFY_CLIENT_ID environment variable");
  }

  const shop = normalizeShop(req.query.shop);

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return res.status(400).send("Missing or invalid shop");
  }

  const redirectUri = `${HOST_URL}/api/shopify/auth/callback`;
  const state = Math.random().toString(36).slice(2);

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(SHOPIFY_CLIENT_ID)}` +
    `&scope=${encodeURIComponent(SHOPIFY_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return res.redirect(installUrl);
}
