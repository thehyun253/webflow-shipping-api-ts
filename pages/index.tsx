import { useState } from "react";
import Head from "next/head";

type ShippingRate = {
  serviceName: string;
  shipmentCost: number;
};

export default function Home() {
  const [zip, setZip] = useState("");
  const [productPrice, setProductPrice] = useState(49.99);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchShippingRates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, productPrice }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setShippingRates(data);
      } else {
        alert("배송 옵션을 불러올 수 없습니다");
      }
    } catch (e) {
      console.error("배송 옵션 오류", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (shippingOption: ShippingRate) => {
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
        <button onClick={fetchShippingRates} disabled={loading}>
          배송비 계산
        </button>

        {shippingRates.length > 0 && (
          <div>
            <h2>배송 옵션 선택</h2>
            <ul>
              {shippingRates.map((rate, i) => (
                <li key={i} style={{ marginBottom: "1rem" }}>
                  <strong>{rate.serviceName}</strong> — ${rate.shipmentCost}
                  <br />
                  <button onClick={() => handleCheckout(rate)}>
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
