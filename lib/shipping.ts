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
      carrierCode: 'fedex', // FedEx로 한정
      packageCode: 'package',
      fromPostalCode: '10010',
      toPostalCode: zip,
      toCountryCode: 'US', // 정확한 필드명
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

  const data = await response.json();

  // 응답 구조에 따라 경로 조정 필요할 수 있음
  const options = data.rateResponse?.shippingOptions || data || [];

  // 원하는 FedEx 옵션만 필터링
  const filteredOptions = options.filter(
    (option: any) =>
      option.serviceName === 'FedEx Standard Overnight' ||
      option.serviceName === 'FedEx Priority Overnight'
  );

  // 필요한 필드만 추출해서 리턴
  return filteredOptions.map((option: any) => ({
    serviceName: option.serviceName,
    shipmentCost: option.shipmentCost,
  }));
}
