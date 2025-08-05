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
    residential: true,
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

  const options = data.rateResponse?.shippingOptions || [];
  if (options.length === 0) {
    console.warn(`⚠️ ShipStation: shippingOptions이 비어있음. ZIP: ${zip}`);
  }

  const filteredOptions = options.filter(
    (option: any) =>
      option.serviceName === 'FedEx Standard Overnight®' ||
      option.serviceName === 'FedEx Priority Overnight®'
  );

  console.log('✅ 최종 filtered options:', filteredOptions);

  return filteredOptions.map((option: any) => ({
    serviceName: option.serviceName,
    shipmentCost: option.shipmentCost,
  }));
}
