import type { NextApiRequest, NextApiResponse } from "next";

type ShopifyRateItem = {
  name?: string;
  quantity?: number;
  grams?: number;
  price?: number;
  sku?: string;
  variant_id?: number;
  product_id?: number;
};

type ShopifyRateRequest = {
  rate?: {
    destination?: {
      country?: string;
      province?: string;
      city?: string;
      postal_code?: string;
    };
    items?: ShopifyRateItem[];
    currency?: string;
  };
};

type ShopifyRateResponse = {
  rates: Array<{
    service_name: string;
    service_code: string;
    total_price: string;
    description: string;
    currency: string;
    min_delivery_date?: string;
    max_delivery_date?: string;
    phone_required?: boolean;
  }>;
};

function normalizeZip(zip: string | undefined | null): string {
  return String(zip || "")
    .trim()
    .split("-")[0]
    .replace(/\D/g, "");
}

function getBoxCount(items?: ShopifyRateItem[]): number {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return 1;
  }

  let totalPacks = 0;

  for (const item of items) {
    const name = String(item.name || "").toLowerCase();
    const quantity = Number(item.quantity || 1);

    /*
      THE HYUN packing logic:
      - Innards / Baby type items = 2 packs per item
      - Other regular items = 3 packs per item
      - 10 packs per shipping box
    */

    const isTwoPackItem =
      name.includes("innard") ||
      name.includes("inner") ||
      name.includes("offal") ||
      name.includes("tripe") ||
      name.includes("baby");

    const packsPerUnit = isTwoPackItem ? 2 : 3;
    totalPacks += packsPerUnit * quantity;
  }

  return Math.max(1, Math.ceil(totalPacks / 10));
}

function getBaseDeliveryRateCents(zip: string): number | null {
  /*
    Temporary ZIP delivery rate table.
    Update this table later with THE HYUN's final delivery zones.

    total_price is in cents:
    $25.00 = 2500
    $35.00 = 3500
  */

  const manhattan25 = new Set([
    "10001", "10002", "10003", "10004", "10005",
    "10006", "10007", "10009", "10010", "10011",
    "10012", "10013", "10014", "10016", "10017",
    "10018", "10019", "10020", "10021", "10022",
    "10023", "10024", "10025", "10026", "10027",
    "10028", "10029", "10030", "10031", "10032",
    "10033", "10034", "10035", "10036", "10037",
    "10038", "10039", "10040", "10044", "10065",
    "10069", "10075", "10128", "10280", "10282"
  ]);

  const brooklyn35 = new Set([
    "11201", "11205", "11206", "11211", "11215",
    "11217", "11222", "11231", "11238"
  ]);

  const queens45 = new Set([
    "11101", "11102", "11103", "11104", "11105",
    "11106", "11377", "11378", "11385"
  ]);

  const nj55 = new Set([
    "07030", "07086", "07302", "07310", "07311"
  ]);

  if (manhattan25.has(zip)) return 2500;
  if (brooklyn35.has(zip)) return 3500;
  if (queens45.has(zip)) return 4500;
  if (nj55.has(zip)) return 5500;

  return null;
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);

  while (days > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();

    if (day !== 0 && day !== 6) {
      days -= 1;
    }
  }

  return result;
}

function toShopifyDateTime(date: Date): string {
  return date.toISOString();
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ShopifyRateResponse | { error: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as ShopifyRateRequest;
    const rate = body.rate;

    const zip = normalizeZip(rate?.destination?.postal_code);
    const currency = rate?.currency || "USD";

    if (!zip) {
      return res.status(200).json({ rates: [] });
    }

    const baseRateCents = getBaseDeliveryRateCents(zip);

    if (baseRateCents === null) {
      return res.status(200).json({ rates: [] });
    }

    const boxCount = getBoxCount(rate?.items);

    /*
      If there are 2 or more boxes, add $15 per extra box.
      If you do not want extra box fees, change 1500 to 0.
    */
    const extraBoxFeeCents = Math.max(0, boxCount - 1) * 1500;
    const totalPriceCents = baseRateCents + extraBoxFeeCents;

    const now = new Date();
    const minDeliveryDate = addBusinessDays(now, 1);
    const maxDeliveryDate = addBusinessDays(now, 2);

    return res.status(200).json({
      rates: [
        {
          service_name: "THE HYUN Local Delivery",
          service_code: "the_hyun_local_delivery",
          total_price: String(totalPriceCents),
          description: "Local refrigerated delivery",
          currency,
          min_delivery_date: toShopifyDateTime(minDeliveryDate),
          max_delivery_date: toShopifyDateTime(maxDeliveryDate),
          phone_required: true
        }
      ]
    });
  } catch (error) {
    console.error("Shopify rates error:", error);

    return res.status(200).json({
      rates: []
    });
  }
}
