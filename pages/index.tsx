import { useState } from "react";
import Head from "next/head";

type ShippingRate = {
  serviceName: string;
  shipmentCost: number;
};

export default function Home() {
  const [zip, setZip] = useState("");
  const [productPrice] = useState(49.99); // Fixed product price
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(false);

  // 🚚 Fetch available shipping rates
  const fetchShippingRates = async () => {
    if (!/^\d{5}$/.test(zip)) {
      alert("Please enter a valid 5-digit ZIP code.");
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
        alert("Unable to fetch shipping options.");
      }
    } catch (e) {
      console.error("Shipping rate error", e);
      alert("An error occurred while fetching shipping options.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Handle Stripe Checkout
  const handleCheckout = async (shippingOption: ShippingRate) => {
    if (!/^\d{5}$/.test(zip)) {
      alert("Please enter a valid ZIP code before checkout.");
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
        alert("Failed to redirect to the checkout page.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert("An error occurred during checkout.");
    }
  };

  return (
    <>
      <Head>
        <title>Shipping + Stripe Demo</title>
      </Head>
      <main style={{ padding: "2rem" }}>
        <h1>Enter Your ZIP Code</h1>
        <input
          type="text"
          placeholder="ZIP Code"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
        />
        <button onClick={fetchShippingRates} disabled={loading || !zip}>
          Calculate Shipping
        </button>

        {shippingRates.length > 0 && (
          <div style={{ marginTop: "2rem" }}>
            <h2>Select a Shipping Option</h2>
            <ul>
              {shippingRates.map((rate, i) => (
                <li key={i} style={{ marginBottom: "1rem" }}>
                  <strong>{rate.serviceName}</strong> — ${rate.shipmentCost.toFixed(2)}
                  <br />
                  <button
                    onClick={() => handleCheckout(rate)}
                    disabled={!/^\d{5}$/.test(zip)}
                  >
                    Checkout with This Option
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
