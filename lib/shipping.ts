const PRIORITY_OVERNIGHT = "fedex_priority_overnight";

export type ShippingRateRow = {
  serviceName: string;
  serviceCode: string;
  shipmentCost: number;
};

export async function getShippingRates(zip: string): Promise<ShippingRateRow[]> {
  console.log(`🚚 getShippingRates 호출: toPostalCode = ${zip}`);

  const payload = {
    carrierCode: "fedex_walleted",
    packageCode: "package",
    fromPostalCode: "10010",
    fromCountry: "US",
    fromState: "NY",
    fromCity: "New York",
    toPostalCode: zip,
    toCountry: "US",
    weight: { value: 20, units: "pounds" },
    dimensions: {
      units: "inches" as const,
      length: 21.7,
      width: 13.4,
      height: 10.65,
    },
    confirmation: "none",
    residential: false,
  };

  console.log("📤 ShipStation 요청 payload:", JSON.stringify(payload, null, 2));

  const response = await fetch("https://ssapi.shipstation.com/shipments/getrates", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`).toString(
          "base64"
        ),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`❌ ShipStation error: ${errorText}`);
  }

  const data = await response.json();
  console.log("📦 ShipStation 응답 전체:", JSON.stringify(data, null, 2));

  const options = Array.isArray(data)
    ? data
    : (data?.rateResponse?.shippingOptions || data?.shippingOptions || []);

  if (options.length === 0) {
    console.warn(`⚠️ ShipStation: options이 비어있음. ZIP: ${zip}`);
  }

  const priority = options.filter(
    (o: { serviceCode?: string }) => o.serviceCode === PRIORITY_OVERNIGHT
  );

  console.log("filtered options (fedex_priority_overnight only):", priority);

  return priority.map((o: { serviceName?: string; serviceCode?: string; shipmentCost?: number; otherCost?: number }) => {
    const base = Number(o.shipmentCost) || 0;
    const extra = Number(o.otherCost) || 0;
    return {
      serviceName: String(o.serviceName ?? ""),
      serviceCode: String(o.serviceCode ?? ""),
      shipmentCost: base + extra,
    };
  });
}
