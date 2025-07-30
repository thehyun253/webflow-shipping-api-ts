// lib/shipping.ts
export async function getShippingRates(zip: string) {
  const response = await fetch('https://ssapi.shipstation.com/shipments/getrates', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(
          `${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`
        ).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      carrierCode: 'fedex',
      packageCode: 'package',
      fromPostalCode: '10010',
      toPostalCode: zip,
      toCountryCode: 'US',
      weight: {
        value: 11,
        units: 'pounds',
      },
      dimensions: {
        units: 'inches',
        length: 17.25,
        width: 14.5,
        height: 8.5,
      },
      confirmation: 'none',
      residential: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ ShipStation fetch error:', errorText);
    throw new Error(`ShipStation error: ${errorText}`);
  }

  const data = await response.json();
  console.log('✅ ShipStation raw response:', JSON.stringify(data, null, 2)); // 👈 로그 추가

  const options = data.rateResponse?.shippingOptions || data || [];

  const filteredOptions = options.filter(
    (option: any) =>
      option.serviceName === 'FedEx Standard Overnight' ||
      option.serviceName === 'FedEx Priority Overnight'
  );

  return filteredOptions.map((option: any) => ({
    serviceName: option.serviceName,
    shipmentCost: option.shipmentCost,
  }));
}
