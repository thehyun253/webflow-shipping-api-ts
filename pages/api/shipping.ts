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
      carrierCode: 'stamps_com',
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
    throw new Error(`ShipStation error: ${errorText}`);
  }

  return response.json();
}
