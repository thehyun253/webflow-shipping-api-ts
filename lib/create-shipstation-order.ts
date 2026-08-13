type OrderProduct = {
  name: string;
  description: string;
  quantity: number;
  amountSubtotal: number;
  amountTotal: number;
  currency: string;
};

type CheckoutOrder = {
  stripeSessionId: string;
  paymentIntentId: string | null;

  customer: {
    name: string;
    email: string;
    phone: string;
  };

  shippingAddress: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;

  amountSubtotal: number;
  amountTotal: number;
  currency: string;

  isDelivery: boolean;
  boxCount: number;
  itemCount: number;

  shippingService: string;

  giftMessageEnabled: boolean;
  giftMessage: string;

  products: OrderProduct[];
};

function shipStationAuth() {
  const key = process.env.SHIPSTATION_API_KEY;
  const secret = process.env.SHIPSTATION_API_SECRET;

  if (!key || !secret) {
    throw new Error(
      "Missing SHIPSTATION_API_KEY or SHIPSTATION_API_SECRET"
    );
  }

  return (
    "Basic " +
    Buffer.from(`${key}:${secret}`).toString("base64")
  );
}

function centsToDollars(value: number) {
  return Math.round(value) / 100;
}

export async function createShipStationOrder(
  order: CheckoutOrder
) {
  if (!order.isDelivery) {
    console.log(
      "[shipstation] Pickup order - skipping ShipStation:",
      order.stripeSessionId
    );

    return null;
  }

  if (!order.shippingAddress) {
    throw new Error(
      `Missing shipping address for ${order.stripeSessionId}`
    );
  }

  const address = order.shippingAddress;

  const customerName =
    order.customer.name?.trim() || "Customer";

  const boxCount = Math.max(
    1,
    Number(order.boxCount) || 1
  );

  const notes: string[] = [
    `Stripe Session: ${order.stripeSessionId}`,
    `Boxes: ${boxCount}`,
    `Package per box: 21.7 x 13.4 x 10.65 in`,
    `Billing weight per box: 20 lb`,
  ];

  if (order.paymentIntentId) {
    notes.push(
      `Payment Intent: ${order.paymentIntentId}`
    );
  }

  if (order.giftMessageEnabled) {
    notes.push(
      `Gift Message: ${order.giftMessage || "(blank)"}`
    );
  }

  const payload = {
    orderNumber: order.stripeSessionId,

    // 같은 Stripe Checkout Session이면
    // 새 주문 대신 기존 주문 업데이트
    orderKey: order.stripeSessionId,

    orderDate: new Date().toISOString(),

    orderStatus: "awaiting_shipment",

    customerEmail:
      order.customer.email || "",

    customerUsername:
      order.customer.email || "",

    billTo: {
      name: customerName,
      company: "",
      street1: address.line1,
      street2: address.line2 || "",
      street3: "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country || "US",
      phone: order.customer.phone || "",
      residential: false,
    },

    shipTo: {
      name: customerName,
      company: "",
      street1: address.line1,
      street2: address.line2 || "",
      street3: "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country || "US",
      phone: order.customer.phone || "",
      residential: false,
    },

    items: order.products.map(
      (product, index) => ({
        lineItemKey: `${order.stripeSessionId}-${index + 1}`,

        sku: "",

        name: product.name,

        imageUrl: null,

        weight: null,

        quantity: product.quantity,

        unitPrice:
          product.quantity > 0
            ? Number(
                (
                  centsToDollars(
                    product.amountTotal
                  ) / product.quantity
                ).toFixed(2)
              )
            : centsToDollars(
                product.amountTotal
              ),

        taxAmount: 0,

        shippingAmount: 0,

        warehouseLocation: "",
        options: product.description
          ? [
              {
                name: "Description",
                value: product.description,
              },
            ]
          : [],

        productId: null,

        fulfillmentSku: null,

        adjustment: false,

        upc: null,

        createProduct: false,
      })
    ),

    amountPaid:
      centsToDollars(order.amountTotal),

    taxAmount: 0,

    shippingAmount: 0,

    customerNotes:
      order.giftMessageEnabled
        ? order.giftMessage
        : "",

    internalNotes: notes.join("\n"),

    gift: order.giftMessageEnabled,

    giftMessage:
      order.giftMessageEnabled
        ? order.giftMessage
        : "",

    paymentMethod: "Stripe",

    requestedShippingService:
      order.shippingService ||
      "FedEx Priority Overnight",

    carrierCode: "fedex_walleted",

    serviceCode:
      "fedex_priority_overnight",

    packageCode: "package",

    confirmation: "none",

    shipDate: new Date()
      .toISOString()
      .slice(0, 10),

    weight: {
      value: 20,
      units: "pounds",
    },

    dimensions: {
      units: "inches",
      length: 21.7,
      width: 13.4,
      height: 10.65,
    },

    insuranceOptions: {
      provider: null,
      insureShipment: false,
      insuredValue: 0,
    },

    internationalOptions: {
      contents: null,
      customsItems: null,
      nonDelivery: null,
    },

    advancedOptions: {
      billToParty: null,
      billToAccount: null,
      billToPostalCode: null,
      billToCountryCode: null,
      storeId: null,
    },

    tagIds: null,
  };

  console.log(
    "[shipstation] Creating order:",
    JSON.stringify(payload, null, 2)
  );

  const response = await fetch(
    "https://ssapi.shipstation.com/orders/createorder",
    {
      method: "POST",

      headers: {
        Authorization: shipStationAuth(),
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),
    }
  );

  const raw = await response.text();

  if (!response.ok) {
    console.error(
      "[shipstation] Order creation failed:",
      raw
    );

    throw new Error(
      `ShipStation create order failed (${response.status}): ${raw}`
    );
  }

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  console.log(
    "[shipstation] ORDER CREATED",
    JSON.stringify(data, null, 2)
  );

  return data;
}
