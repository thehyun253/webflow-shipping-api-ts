/**
 * Webflow Checkout custom code (Before </body>)
 *
 * Purpose:
 * - Keep preview shipping quote consistent with final Stripe checkout shipping amount.
 * - Reuse the same payload shape used by create-checkout-session:
 *   { zip, isDeliver, items }
 */
(function () {
  const API_BASE = "https://shipping.thehyun.com";

  function normalize(str) {
    return str ? str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "";
  }

  function getCheckoutItemsAndDeliveryFlag() {
    const categoryMap = {};
    document.querySelectorAll(".lz_info_products .w-dyn-item").forEach((el) => {
      const prodNameEl = el.querySelector(".lz_info_products_txt");
      const catNameEl = el.querySelector(".lz_info_category_txt");
      if (!prodNameEl || !catNameEl) return;
      categoryMap[normalize(prodNameEl.textContent.trim())] = catNameEl.textContent.trim();
    });

    const selectedMethodEl = document.querySelector('input[name="shipping-method-choice"]:checked');
    const methodText = selectedMethodEl
      ? (selectedMethodEl.closest("label")?.textContent || "").toLowerCase()
      : "";
    const isDeliver = methodText.includes("deliver");

    const items = [];
    const orderList = document.getElementById("lz_order_items");
    if (!orderList) return { isDeliver, items };

    const checkoutItems = orderList.querySelectorAll(
      ".w-commerce-commercecheckoutorderitem, .items-blocks"
    );
    checkoutItems.forEach((el) => {
      const name =
        el.querySelector(".text-block-56")?.textContent.trim() ||
        el.querySelector(".w-commerce-commercecheckoutorderitemname")?.textContent.trim() ||
        "";

      const qtyEl = el.querySelector(".option-quantity");
      const quantity = qtyEl ? parseInt(qtyEl.textContent.replace(/[^0-9]/g, ""), 10) : 1;

      const weightEl = el.querySelector(".option-weight");
      let weight = false;
      if (weightEl) {
        const match = weightEl.textContent.match(/[0-9.]+/);
        weight = match ? String(match[0]) : false;
      }

      const priceEl = el.querySelector(".option-price");
      const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, "")) || 0 : 0;

      const singlePriceEl = el.querySelector(".option-single-price");
      const singlePrice = singlePriceEl
        ? parseFloat(singlePriceEl.textContent.replace(/[^0-9.]/g, "")) || 0
        : 0;

      const rawCategory = categoryMap[normalize(name)] || "General";
      const categoryLower = rawCategory.toLowerCase();

      if (!name) return;
      items.push({
        name,
        quantity: Number.isNaN(quantity) ? 1 : quantity,
        weight,
        price,
        "single-price": singlePrice,
        isBundle: categoryLower.includes("bundles"),
        isGift: categoryLower.includes("gift"),
      });
    });

    return { isDeliver, items };
  }

  async function requestPreviewQuote(zip) {
    const { isDeliver, items } = getCheckoutItemsAndDeliveryFlag();
    const response = await fetch(`${API_BASE}/api/get-shipping-rates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, isDeliver, items }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || `Request failed (${response.status})`);
    }

    return data;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const zipInput = document.getElementById("wf-ecom-shipping-zip");
    const preview = document.getElementById("shipping-preview");
    if (!zipInput || !preview) return;

    let timer = null;
    zipInput.addEventListener("input", function () {
      if (timer) clearTimeout(timer);
      const zip = zipInput.value.trim();

      if (!/^\d{5}$/.test(zip)) {
        preview.textContent = "ZIP 입력 대기중...";
        return;
      }

      timer = setTimeout(async function () {
        try {
          preview.textContent = "배송비 계산중...";
          const data = await requestPreviewQuote(zip);
          const cost = data?.shippingCost;
          preview.textContent =
            typeof cost === "number"
              ? `Estimated shipping: $${cost.toFixed(2)}`
              : "Shipping unavailable for this ZIP";
        } catch (error) {
          preview.textContent = "네트워크 오류";
        }
      }, 400);
    });
  });
})();
