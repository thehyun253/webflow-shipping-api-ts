import type { NextApiRequest, NextApiResponse } from "next";
import {
  getShippingQuote,
  ShippingQuoteError,
  SHIPPING_QUOTE_ERRORS,
} from "@/lib/get-shipping-quote";
import {
  CHECKOUT_VALIDATION_ERROR_MESSAGE,
  SHIPPING_UNAVAILABLE_MESSAGE,
  type NormalizedCheckoutItem,
} from "@/lib/validate-checkout-request";

type PreviewRequestBody = {
  zip?: string;
  isDeliver?: boolean;
  items?: unknown;
};

function normalizeWeight(raw: unknown): false | string | null {
  if (raw === false) return false;
  if (typeof raw === "number" && !Number.isNaN(raw)) return String(raw);
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return false;
    return t;
  }
  return null;
}

function isNormalizedCheckoutItem(value: unknown): value is NormalizedCheckoutItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;

  const validWeight =
    item.weight === false || typeof item.weight === "string";

  return (
    typeof item.name === "string" &&
    item.name.trim() !== "" &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    typeof item.price === "number" &&
    !Number.isNaN(item.price) &&
    typeof item.singlePrice === "number" &&
    !Number.isNaN(item.singlePrice) &&
    typeof item.isBundle === "boolean" &&
    typeof item.isGift === "boolean" &&
    validWeight
  );
}

function normalizePreviewItem(value: unknown): NormalizedCheckoutItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const singlePriceRaw =
    typeof raw.singlePrice === "number" ? raw.singlePrice : raw["single-price"];
  const weight = normalizeWeight(raw.weight);
  if (weight === null) return null;

  const candidate: Record<string, unknown> = {
    ...raw,
    singlePrice: singlePriceRaw,
    weight,
  };

  return isNormalizedCheckoutItem(candidate)
    ? (candidate as NormalizedCheckoutItem)
    : null;
}

function parsePreviewBody(body: unknown):
  | {
      ok: true;
      data: { zip: string | undefined; isDeliver: boolean; items: NormalizedCheckoutItem[] };
    }
  | { ok: false } {
  if (!body || typeof body !== "object") return { ok: false };
  const raw = body as PreviewRequestBody;

  // Backward compatibility: support legacy preview calls with ZIP only.
  if (typeof raw.zip === "string" && raw.isDeliver === undefined && raw.items === undefined) {
    return {
      ok: true,
      data: {
        zip: raw.zip,
        isDeliver: true,
        items: [
          {
            name: "Legacy Preview Placeholder",
            quantity: 1,
            price: 0,
            singlePrice: 0,
            isBundle: false,
            isGift: false,
            weight: false,
          },
        ],
      },
    };
  }

  if (raw.isDeliver !== true && raw.isDeliver !== false) return { ok: false };
  if (raw.isDeliver === true && (typeof raw.zip !== "string" || !/^\d{5}$/.test(raw.zip))) {
    return { ok: false };
  }
  if (!Array.isArray(raw.items) || raw.items.length < 1) return { ok: false };

  const items: NormalizedCheckoutItem[] = [];
  for (const it of raw.items) {
    const normalized = normalizePreviewItem(it);
    if (!normalized) return { ok: false };
    items.push(normalized);
  }

  return {
    ok: true,
    data: {
      zip: raw.zip,
      isDeliver: raw.isDeliver,
      items,
    },
  };
}

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

  const parsed = parsePreviewBody(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: CHECKOUT_VALIDATION_ERROR_MESSAGE });
  }

  try {
    const quote = await getShippingQuote(parsed.data);
    return res.status(200).json({
      shippingCost: quote.shippingCost,
      boxCount: quote.boxCount,
      totalPacks: quote.totalPacks,
    });
  } catch (error: any) {
    if (
      error instanceof ShippingQuoteError &&
      error.code === SHIPPING_QUOTE_ERRORS.SHIPPING_UNAVAILABLE
    ) {
      return res.status(422).json({ message: SHIPPING_UNAVAILABLE_MESSAGE });
    }

    console.error("Shipping rate fetch error:", error.message);
    return res.status(500).json({ message: "Failed to fetch shipping rates" });
  }
}