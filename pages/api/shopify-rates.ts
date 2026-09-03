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
    phone_required?: boolean;
  }>;
};

type ShipStationRate = {
  serviceName?: string;
  serviceCode?: string;
  shipmentCost?: number;
  otherCost?: number;
};

const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY;
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET;

const FROM_POSTAL_CODE = "10010";
const FROM_COUNTRY = "US";

const CARRIER_CODE = "fedex_walleted";
const SERVICE_CODE = "fedex_priority_overnight";
const PACKAGE_CODE = "package";

const BOX_LENGTH = 21.7;
const BOX_WIDTH = 13.4;
const BOX_HEIGHT = 10.65;

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

function getTotalWeightOz(items?: ShopifyRateItem[]): number {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return 320;
  }

  let totalGrams = 0;

  for (const item of items) {
    const grams = Number(item.grams || 0);
    const quantity = Number(item.quantity || 1);

    totalGrams += grams * quantity;
  }

  if (totalGrams <= 0) {
    return 320;
  }

  const itemWeightOz = totalGrams / 28.3495;

  /*
    Estimated dry ice / insulation / packaging weight.
    8 lb = 128 oz.
  */
  const packagingWeightOz = 128;

  return Math.ceil(itemWeightOz + packagingWeightOz);
}

function getBasicAuthHeader(): string {
  const token = Buffer.from(
    `${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`
  ).toString("base64");

  return `Basic ${token}`;
}

async function getShipStationFedExRate(params: {
  toZip: string;
  toState?: string;
  toCity?: string;
  toCountry?: string;
  weightOz: number;
}): Promise<number | null> {
  if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
    throw new Error("Missing ShipStation API credentials");
  }

  const response = await fetch("https://ssapi.shipstation.com/shipments/getrates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getBasicAuthHeader()
    },
    body: JSON.stringify({
      carrierCode: CARRIER_CODE,
      serviceCode: SERVICE_CODE,
      packageCode: PACKAGE_CODE,
      fromPostalCode: FROM_POSTAL_CODE,
      toState: params.toState || "",
      toCountry: params.toCountry || FROM_COUNTRY,
      toPostalCode: params.toZip,
      toCity: params.toCity || "",
      weight: {
        value: params.weightOz,
        units: "ounces"
      },
      dimensions: {
        units: "inches",
        length: BOX_LENGTH,
        width: BOX_WIDTH,
        height: BOX_HEIGHT
      },
      confirmation: "delivery",

      /*
        Customer addresses are usually residential.
        This gives a safer/more realistic FedEx rate.
      */
      residential: true
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("ShipStation getrates failed:", data);
    return null;
  }

  const rates = Array.isArray(data) ? (data as ShipStationRate[]) : [];

  const targetRate =
    rates.find((rate) => rate.serviceCode === SERVICE_CODE) || rates[0];

  if (!targetRate) {
    return null;
  }

  const shipmentCost = Number(targetRate.shipmentCost || 0);
  const otherCost = Number(targetRate.otherCost || 0);
  const total = shipmentCost + otherCost;

  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  return Math.round(total * 100);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ShopifyRateResponse | { error: string; message?: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as ShopifyRateRequest;
    const rate = body.rate;

    const destination = rate?.destination;
    const zip = normalizeZip(destination?.postal_code);
    const currency = rate?.currency || "USD";

    if (!zip) {
      return res.status(200).json({ rates: [] });
    }

    const boxCount = getBoxCount(rate?.items);
    const totalWeightOz = getTotalWeightOz(rate?.items);

    /*
      ShipStation getrates is called per box.
      If multiple boxes are needed, we multiply the one-box rate by box count.
    */
    const oneBoxRateCents = await getShipStationFedExRate({
      toZip: zip,
      toState: destination?.province,
      toCity: destination?.city,
      toCountry: destination?.country || "US",
      weightOz: Math.ceil(totalWeightOz / boxCount)
    });

    if (oneBoxRateCents === null) {
      return res.status(200).json({ rates: [] });
    }

    const totalPriceCents = oneBoxRateCents * boxCount;

    return res.status(200).json({
      rates: [
        {
          service_name: "FedEx Priority Overnight",
          service_code: "fedex_priority_overnight",
          total_price: String(totalPriceCents),
          description: "Overnight delivery after shipment",
          currency,
          phone_required: false
        }
      ]
    });
  } catch (error) {
    console.error("Shopify ShipStation rates error:", error);

    return res.status(200).json({
      rates: []
    });
  }
}
