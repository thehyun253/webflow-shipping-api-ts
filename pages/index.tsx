import { useState } from "react";
import Head from "next/head";

type ShippingRate = {
  serviceName: string;
  shipmentCost: number;
};

export default function Home() {
  const [zip, setZip] = useState("");
  const [productPrice] = useState(49.99); // 고정 상품 가격
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(false);

  // 🚚 배송 옵션 조회
  const fetchShippingRates = async () => {
    if (!/^\d{5}$/.test(zip)) {
      alert("유효한 ZIP 코드를 입력하세요 (5자리 숫자)");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/get-shipping-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setShippingRates(data);
      } else {
        alert("배송 옵션을 불러올 수 없습니다");
      }
    } catch (e) {
      console.error("배송 옵션 오류", e);
      alert("배송 옵션 오류");
    } finally {
      setLoading(false);
    }
  };

  // ✅ 고객이 배송 옵션을 선택하고 결제 버튼 클릭
  const handleCheckout = async (shippingOption: ShippingRate) => {
    if (!/^\d{5}$/.test(zip)) {
      alert("유효한 ZIP 코드를 먼저 입력하세요");
      return;
    }

    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip,
          productPrice,
          shippingCost: shippingOption.shipmentCost,
          shippingName: shippingOption.serviceName,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("결제 페이지로 이동할 수 없습니다");
      }
    } catch (err) {
      console.error("Checkout Error:", err);
      alert("결제 처리 중 오류가 발생했습니다");
    }
  };

  return (
    <>
      <Head>
        <title>Shipping + Stripe Demo</title>
      </Head>
      <main style={{ padding: "2rem" }}>
        <h1>배송지 ZIP 입력</h1>
        <input
          type="text"
          placeholder="ZIP Code"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
        />
        <button onClick={fetchShippingRates} disabled={loading || !zip}>
          배송비 계산
        </button>

        {shippingRates.length > 0 && (
          <div style={{ marginTop: "2rem" }}>
            <h2>배송 옵션 선택</h2>
            <ul>
              {shippingRates.map((rate, i) => (
                <li key={i} style={{ marginBottom: "1rem" }}>
                  <strong>{rate.serviceName}</strong> — ${rate.shipmentCost.toFixed(2)}
                  <br />
                  <button
                    onClick={() => handleCheckout(rate)}
                    disabled={!/^\d{5}$/.test(zip)} // 유효하지 않으면 비활성화
                  >
                    이 옵션으로 결제
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}
