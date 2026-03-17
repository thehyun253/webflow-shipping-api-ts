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

  try {
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

    // 1. 응답 성공 여부 확인 및 상세 에러 로그 기록
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [ShipStation 상세 에러 로그]: ${errorText}`);
      throw new Error(`ShipStation API Error: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 ShipStation 응답 전체:', JSON.stringify(data, null, 2));

    // 2. 기존 응답 형태 대응 로직 (유지)
    const options = Array.isArray(data)
      ? data
      : (data?.rateResponse?.shippingOptions || data?.shippingOptions || []);

    if (options.length === 0) {
      console.warn(`⚠️ ShipStation: options이 비어있음. ZIP: ${zip}`);
    }

    // 3. 기존 필터링 로직 (유지)
    const allowedServiceCodes = new Set([
      'fedex_priority_overnight',
      'fedex_standard_overnight',
    ]);

    const filtered = options.filter((o: any) => allowedServiceCodes.has(o.serviceCode));
    console.log("filtered options:", filtered);

    // 검색된 결과가 없을 경우 예외 처리 (catch로 이동)
    if (filtered.length === 0) {
      throw new Error("No_Matching_Service");
    }

    return filtered.map((o: any) => ({
      serviceName: o.serviceName,
      serviceCode: o.serviceCode,
      shipmentCost: o.shipmentCost,
    }));

  } catch (err: any) {
    // 4. 에러 발생 시 로그만 남기고 테스트용 고정 데이터 반환
    console.log("--------------------------------------------------");
    console.log(`💡 알림: ShipStation 문제(${err.message})로 임시 배송비를 적용합니다.`);
    console.log("--------------------------------------------------");

    return [{
      serviceName: "Standard Overnight (Fixed Rate)",
      serviceCode: "fedex_standard_overnight",
      shipmentCost: 15.00, // 테스트용 기본 금액
    }];
  }
}