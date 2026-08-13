// lib/send-order-emails.ts

import { Resend } from "resend";

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

const resend = new Resend(
  process.env.RESEND_API_KEY
);

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(
  cents: number,
  currency = "usd"
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency:
        currency.toUpperCase(),
    }
  ).format(
    Number(cents || 0) / 100
  );
}

function addressHtml(
  order: CheckoutOrder
) {
  const address =
    order.shippingAddress;

  if (!address) {
    return "Store Pickup";
  }

  return [
    escapeHtml(order.customer.name),
    escapeHtml(address.line1),
    address.line2
      ? escapeHtml(address.line2)
      : "",
    escapeHtml(
      `${address.city}, ${address.state} ${address.postalCode}`
    ),
    address.country &&
    address.country !== "US"
      ? escapeHtml(address.country)
      : "",
  ]
    .filter(Boolean)
    .join("<br>");
}

function productRows(
  order: CheckoutOrder
) {
  return order.products
    .map((product) => {
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #e5e5e5;">
            <div style="font-weight:600;">
              ${escapeHtml(product.name)}
            </div>

            ${
              product.description
                ? `
                  <div style="margin-top:4px;color:#777;font-size:13px;">
                    ${escapeHtml(product.description)}
                  </div>
                `
                : ""
            }
          </td>

          <td
            style="
              padding:14px 0;
              border-bottom:1px solid #e5e5e5;
              text-align:right;
              vertical-align:top;
              white-space:nowrap;
            "
          >
            ${money(
              product.amountTotal,
              product.currency
            )}
          </td>
        </tr>
      `;
    })
    .join("");
}

function customerEmailHtml(
  order: CheckoutOrder
) {
  const shippingAmount =
    Math.max(
      0,
      order.amountTotal -
        order.amountSubtotal
    );

  return `
    <div
      style="
        font-family:Arial,Helvetica,sans-serif;
        color:#222;
        max-width:640px;
        margin:0 auto;
        padding:30px 20px;
      "
    >
      <div
        style="
          font-size:24px;
          font-weight:600;
          margin-bottom:8px;
        "
      >
        Thank you for your order.
      </div>

      <div
        style="
          color:#666;
          line-height:1.6;
          margin-bottom:32px;
        "
      >
        Your payment has been successfully received.
        We are now preparing your order.
      </div>

      <div
        style="
          border-top:1px solid #222;
          padding-top:18px;
          margin-bottom:30px;
        "
      >
        <div
          style="
            font-size:13px;
            text-transform:uppercase;
            letter-spacing:.06em;
            font-weight:600;
            margin-bottom:15px;
          "
        >
          Customer Information
        </div>

        <div style="line-height:1.7;">
          ${escapeHtml(
            order.customer.email
          )}

          ${
            order.customer.phone
              ? `<br>${escapeHtml(
                  order.customer.phone
                )}`
              : ""
          }
        </div>
      </div>

      ${
        order.isDelivery
          ? `
            <div
              style="
                border-top:1px solid #222;
                padding-top:18px;
                margin-bottom:30px;
              "
            >
              <div
                style="
                  font-size:13px;
                  text-transform:uppercase;
                  letter-spacing:.06em;
                  font-weight:600;
                  margin-bottom:15px;
                "
              >
                Shipping Information
              </div>

              <div style="line-height:1.7;">
                ${addressHtml(order)}
              </div>

              <div
                style="
                  margin-top:12px;
                  color:#666;
                "
              >
                ${
                  escapeHtml(
                    order.shippingService ||
                      "FedEx Priority Overnight"
                  )
                }
              </div>
            </div>
          `
          : `
            <div
              style="
                border-top:1px solid #222;
                padding-top:18px;
                margin-bottom:30px;
              "
            >
              <div
                style="
                  font-size:13px;
                  text-transform:uppercase;
                  letter-spacing:.06em;
                  font-weight:600;
                  margin-bottom:15px;
                "
              >
                Order Method
              </div>

              <div>Store Pickup</div>
            </div>
          `
      }

      <div
        style="
          border-top:1px solid #222;
          padding-top:18px;
          margin-bottom:30px;
        "
      >
        <div
          style="
            font-size:13px;
            text-transform:uppercase;
            letter-spacing:.06em;
            font-weight:600;
            margin-bottom:8px;
          "
        >
          Items in Order
        </div>

        <table
          cellpadding="0"
          cellspacing="0"
          width="100%"
          style="border-collapse:collapse;"
        >
          ${productRows(order)}
        </table>
      </div>

      ${
        order.giftMessageEnabled &&
        order.giftMessage
          ? `
            <div
              style="
                border-top:1px solid #222;
                padding-top:18px;
                margin-bottom:30px;
              "
            >
              <div
                style="
                  font-size:13px;
                  text-transform:uppercase;
                  letter-spacing:.06em;
                  font-weight:600;
                  margin-bottom:12px;
                "
              >
                Gift Message
              </div>

              <div
                style="
                  line-height:1.6;
                  white-space:pre-wrap;
                "
              >
                ${escapeHtml(
                  order.giftMessage
                )}
              </div>
            </div>
          `
          : ""
      }

      <div
        style="
          border-top:1px solid #222;
          padding-top:18px;
        "
      >
        <table
          cellpadding="0"
          cellspacing="0"
          width="100%"
          style="border-collapse:collapse;"
        >
          <tr>
            <td style="padding:6px 0;">
              Subtotal
            </td>

            <td
              style="
                padding:6px 0;
                text-align:right;
              "
            >
              ${money(
                order.amountSubtotal,
                order.currency
              )}
            </td>
          </tr>

          <tr>
            <td style="padding:6px 0;">
              Shipping
            </td>

            <td
              style="
                padding:6px 0;
                text-align:right;
              "
            >
              ${
                order.isDelivery
                  ? money(
                      shippingAmount,
                      order.currency
                    )
                  : "Free"
              }
            </td>
          </tr>

          <tr>
            <td
              style="
                padding-top:14px;
                font-size:17px;
                font-weight:600;
              "
            >
              Total
            </td>

            <td
              style="
                padding-top:14px;
                text-align:right;
                font-size:17px;
                font-weight:600;
              "
            >
              ${money(
                order.amountTotal,
                order.currency
              )}
            </td>
          </tr>
        </table>
      </div>

      <div
        style="
          margin-top:36px;
          padding-top:20px;
          border-top:1px solid #e5e5e5;
          color:#777;
          font-size:12px;
          line-height:1.6;
        "
      >
        THE HYUN<br>
        New York, NY
      </div>
    </div>
  `;
}

function adminEmailHtml(
  order: CheckoutOrder
) {
  return `
    <div
      style="
        font-family:Arial,Helvetica,sans-serif;
        color:#222;
        max-width:700px;
        margin:0 auto;
        padding:30px 20px;
      "
    >
      <h2 style="margin-top:0;">
        New THE HYUN Online Order
      </h2>

      <p>
        <strong>Customer:</strong>
        ${escapeHtml(
          order.customer.name
        )}
        <br>

        <strong>Email:</strong>
        ${escapeHtml(
          order.customer.email
        )}
        <br>

        <strong>Phone:</strong>
        ${escapeHtml(
          order.customer.phone
        )}
      </p>

      <p>
        <strong>Order Method:</strong>
        ${
          order.isDelivery
            ? "Delivery"
            : "Pickup"
        }
      </p>

      ${
        order.isDelivery
          ? `
            <p>
              <strong>Shipping Address:</strong>
              <br>
              ${addressHtml(order)}
            </p>

            <p>
              <strong>Shipping Service:</strong>
              ${escapeHtml(
                order.shippingService
              )}
              <br>

              <strong>Box Count:</strong>
              ${order.boxCount}
            </p>
          `
          : ""
      }

      <h3>Items</h3>

      <table
        cellpadding="0"
        cellspacing="0"
        width="100%"
        style="border-collapse:collapse;"
      >
        ${productRows(order)}
      </table>

      ${
        order.giftMessageEnabled
          ? `
            <p>
              <strong>Gift Message:</strong>
              <br>
              ${escapeHtml(
                order.giftMessage || "(blank)"
              )}
            </p>
          `
          : ""
      }

      <p
        style="
          margin-top:24px;
          font-size:18px;
        "
      >
        <strong>Total:</strong>
        ${money(
          order.amountTotal,
          order.currency
        )}
      </p>

      <hr
        style="
          border:0;
          border-top:1px solid #ddd;
          margin:25px 0;
        "
      >

      <p style="font-size:12px;color:#777;">
        Stripe Session:
        ${escapeHtml(
          order.stripeSessionId
        )}
      </p>
    </div>
  `;
}

export async function sendOrderEmails(
  order: CheckoutOrder
) {
  const apiKey =
    process.env.RESEND_API_KEY;

  const from =
    process.env.ORDER_FROM_EMAIL;

  const adminEmail =
    process.env.ADMIN_ORDER_EMAIL;

  if (!apiKey) {
    throw new Error(
      "Missing RESEND_API_KEY"
    );
  }

  if (!from) {
    throw new Error(
      "Missing ORDER_FROM_EMAIL"
    );
  }

  if (!adminEmail) {
    throw new Error(
      "Missing ADMIN_ORDER_EMAIL"
    );
  }

  if (!order.customer.email) {
    throw new Error(
      "Customer email is missing"
    );
  }

  const customerResult =
    await resend.emails.send(
      {
        from,

        to: [
          order.customer.email,
        ],

        subject:
          "Your THE HYUN Order Confirmation",

        html:
          customerEmailHtml(order),
      },
      {
        idempotencyKey:
          `order-customer/${order.stripeSessionId}`,
      }
    );

  if (customerResult.error) {
    throw new Error(
      `Customer email failed: ${customerResult.error.message}`
    );
  }

  console.log(
    "[email] CUSTOMER CONFIRMATION SENT",
    customerResult.data
  );

  const adminResult =
    await resend.emails.send(
      {
        from,

        to: [
          adminEmail,
        ],

        subject:
          `New Online Order - ${order.customer.name || "Customer"} - ${money(
            order.amountTotal,
            order.currency
          )}`,

        html:
          adminEmailHtml(order),
      },
      {
        idempotencyKey:
          `order-admin/${order.stripeSessionId}`,
      }
    );

  if (adminResult.error) {
    throw new Error(
      `Admin email failed: ${adminResult.error.message}`
    );
  }

  console.log(
    "[email] ADMIN NOTIFICATION SENT",
    adminResult.data
  );

  return {
    customer:
      customerResult.data,

    admin:
      adminResult.data,
  };
}
