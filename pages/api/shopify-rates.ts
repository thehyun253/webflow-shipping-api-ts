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
    Add estimated dry ice / insulation / packaging weight.
    기본 포장 무게 8 lb = 128 oz.
  */
  const packagingWeightOz = 128;

  return Math.ceil(itemWeightOz + packagingWeightOz);
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
      residential: false
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
      ShipStation getrates는 한 박스 기준으로 호출.
      여러 박스면 같은 목적지/같은 박스 조건으로 boxCount만큼 곱함.
      나중에 multi-package exact quote가 필요하면 여기 확장 가능.
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

    const now = new Date();
    const deliveryDate = addBusinessDays(now, 1);

    return res.status(200).json({
      rates: [
        {
          service_name: "FedEx Priority Overnight",
          service_code: "fedex_priority_overnight",
          total_price: String(totalPriceCents),
          description: "Overnight delivery after shipment",
          currency,
          min_delivery_date: toShopifyDateTime(deliveryDate),
          max_delivery_date: toShopifyDateTime(deliveryDate),
          phone_required: true
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
