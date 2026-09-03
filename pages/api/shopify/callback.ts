import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

function verifyShopifyHmac(query: NextApiRequest["query"]): boolean {
  if (!SHOPIFY_CLIENT_SECRET) return false;

  const { hmac, signature, ...rest } = query;

  if (!hmac || Array.isArray(hmac)) {
    return false;
  }

  const message = Object.keys(rest)
    .sort()
    .map((key) => {
      const value = rest[key];
      return `${key}=${Array.isArray(value) ? value.join(",") : value}`;
    })
    .join("&");

  const generatedHmac = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(message)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(generatedHmac, "utf8"),
      Buffer.from(hmac, "utf8")
    );
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!SHOPIFY_CLIENT_ID) {
    return res.status(500).send("Missing SHOPIFY_CLIENT_ID environment variable");
  }

  if (!SHOPIFY_CLIENT_SECRET) {
    return res.status(500).send("Missing SHOPIFY_CLIENT_SECRET environment variable");
  }

  const { shop, code } = req.query;

  if (!shop || Array.isArray(shop) || !shop.endsWith(".myshopify.com")) {
    return res.status(400).send("Missing or invalid shop");
  }

  if (!code || Array.isArray(code)) {
    return res.status(400).send("Missing code");
  }

  const isValidHmac = verifyShopifyHmac(req.query);

  if (!isValidHmac) {
    return res.status(401).send("Invalid Shopify HMAC");
  }

  try {
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(tokenResponse.status).json({
        error: "Failed to get access token",
        data: tokenData
      });
    }

    const accessToken = tokenData.access_token as string;
    const scopes = tokenData.scope || "";

    res.setHeader("Content-Type", "text/html");

    return res.status(200).send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Shopify Token Created</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              background: #f7f7f7;
              color: #111;
            }
            .box {
              max-width: 760px;
              background: #fff;
              border: 1px solid #ddd;
              padding: 28px;
              border-radius: 8px;
            }
            code {
              display: block;
              padding: 16px;
              background: #111;
              color: #fff;
              white-space: pre-wrap;
              word-break: break-all;
              border-radius: 6px;
              margin-top: 12px;
            }
            .warning {
              margin-top: 18px;
              color: #b00020;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Shopify Admin API Token Created</h1>
            <p>Copy this token and add it to Vercel as:</p>
            <code>SHOPIFY_ADMIN_ACCESS_TOKEN=${accessToken}</code>

            <p>Shop:</p>
            <code>${shop}</code>

            <p>Scopes:</p>
            <code>${scopes}</code>

            <p class="warning">
              Do not share this token. Save it in Vercel Environment Variables only.
            </p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Shopify auth callback error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
