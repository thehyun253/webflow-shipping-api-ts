import { useState } from "react";
import Head from "next/head";

type ShippingRate = {
  serviceName: string;
  shipmentCost: number;
};

export default function Home() {
  const [zip, setZip] = useState("");
  const [productPrice] = useState(49.99);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchShippingRates = async () => {
    if (!zip || zip.trim().length < 5) {
      alert("Please enter a valid ZIP code.");
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
      alert("Error fetching shipping rates.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!zip || zip.trim().length < 5) {
      alert("Please enter a valid ZIP code.");
      return;
    }

    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zip,
        productPrice,
        isDeliver: true,
        items: [
          {
            name: "Demo Product",
            quantity: 1,
            price: productPrice,
            "single-price": productPrice,
            isBundle: false,
            isGift: false,
            weight: false,
          },
        ],
      }),
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.message || "Failed to redirect to Stripe Checkout");
    }
  };

  return (
    <>
      <Head>
        <title>Shipping + Stripe Checkout</title>
      </Head>
      <main style={{ padding: "2rem" }}>
        <h1>Enter ZIP Code for Shipping</h1>
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
            <h2>Shipping (server-calculated at checkout)</h2>
            <p style={{ color: "#555", fontSize: "0.9rem" }}>
              Preview shows FedEx Priority Overnight (1 box). Final shipping uses your cart lines and
              box count on the server.
            </p>
            <ul>
              {shippingRates.map((rate, i) => (
                <li key={i} style={{ marginBottom: "1rem" }}>
                  <strong>{rate.serviceName}</strong> — ${rate.shipmentCost.toFixed(2)} (1 box)
                </li>
              ))}
            </ul>
            <button type="button" onClick={handleCheckout}>
              Checkout
            </button>
          </div>
        )}
      </main>
    </>
  );
}
