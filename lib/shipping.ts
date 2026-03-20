export async function getShippingRates(zip: string) {
  console.log(`🚚 getShippingRates 호출: toPostalCode = ${zip}`);

  const payload = {
    carrierCode: 'fedex_walleted',
    packageCode: 'package',
    fromPostalCode: '10010',
    fromCountry: 'US',
    fromState: 'NY',
    fromCity: 'New York',
    toPostalCode: zip,
    toCountry: 'US',
    weight: { value: 11, units: 'pounds' },
    dimensions: { units: 'inches', length: 17.25, width: 14.5, height: 8.5 },
    confirmation: 'none',
    residential: false,
  };

  console.log('📤 ShipStation 요청 payload:', JSON.stringify(payload, null, 2));

  const response = await fetch('https://ssapi.shipstation.com/shipments/getrates', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(`${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`❌ ShipStation error: ${errorText}`);
  }

  const data = await response.json();
  console.log('📦 ShipStation 응답 전체:', JSON.stringify(data, null, 2));




 // 변경1) ShipStation 응답 형태 대응 (배열 or rateResponse.shippingOptions)
  const options = Array.isArray(data)
    ? data
    : (data?.rateResponse?.shippingOptions || data?.shippingOptions || []);

  if (options.length === 0) {
    console.warn(`⚠️ ShipStation: options이 비어있음. ZIP: ${zip}`);
  }

  // 변경2) serviceName -> serviceCode로 필터
  const allowedServiceCodes = new Set([
    'fedex_priority_overnight',
    'fedex_standard_overnight',
  ]);

  const filteredOptions = options.filter((option: any) =>
    allowedServiceCodes.has(option.serviceCode)
  );

  const filtered = options.filter((o: any) => allowedServiceCodes.has(o.serviceCode));

  console.log("filtered options:", filtered);

  return filtered.map((o: any) => ({
    serviceName: o.serviceName,
    serviceCode: o.serviceCode,
    shipmentCost: o.shipmentCost,
  }));
}
