export const CHECKOUT_VALIDATION_ERROR_MESSAGE =
  "We couldn't verify your order. Please return to the cart and try again.";

export const SHIPPING_UNAVAILABLE_MESSAGE =
  "Shipping isn't available for this address. Please check your ZIP code.";

export const PAYMENT_SERVER_ERROR_MESSAGE =
  "Something went wrong while connecting to payment. Please try again in a moment.";

const US_ZIP_PATTERN = /^\d{5}$/;

export type NormalizedWeight = false | string;

export interface NormalizedCheckoutItem {
  name: string;
  quantity: number;
  price: number;
  singlePrice: number;
  isBundle: boolean;
  isGift: boolean;
  weight: NormalizedWeight;
}

export interface NormalizedCheckoutBody {
  productPrice: number;
  isDeliver: boolean;
  zip: string | undefined;
  items: NormalizedCheckoutItem[];
}

export type ValidateCheckoutResult =
  | { ok: true; data: NormalizedCheckoutBody }
  | { ok: false };

function normalizeWeight(raw: unknown): NormalizedWeight | null {
  if (raw === false) return false;
  if (typeof raw === "number" && !Number.isNaN(raw)) {
    return String(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return false;
    return t;
  }
  return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateItem(raw: unknown): NormalizedCheckoutItem | null {
  if (!isPlainObject(raw)) return null;

  const name = raw.name;
  if (typeof name !== "string" || name.trim() === "") return null;

  const quantity = raw.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
    return null;
  }

  const price = raw.price;
  if (typeof price !== "number" || Number.isNaN(price)) return null;

  const singlePrice = raw["single-price"];
  if (typeof singlePrice !== "number" || Number.isNaN(singlePrice)) return null;

  const isBundle = raw.isBundle;
  const isGift = raw.isGift;
  if (typeof isBundle !== "boolean" || typeof isGift !== "boolean") return null;

  const weightResult = normalizeWeight(raw.weight);
  if (weightResult === null) return null;

  return {
    name: name.trim(),
    quantity,
    price,
    singlePrice,
    isBundle,
    isGift,
    weight: weightResult,
  };
}

export function validateCheckoutRequest(body: unknown): ValidateCheckoutResult {
  if (!isPlainObject(body)) return { ok: false };

  const productPrice = body.productPrice;
  if (typeof productPrice !== "number" || Number.isNaN(productPrice)) {
    return { ok: false };
  }

  const isDeliver = body.isDeliver;
  if (isDeliver !== true && isDeliver !== false) {
    return { ok: false };
  }

  let zip: string | undefined;
  if (isDeliver === true) {
    const z = body.zip;
    if (typeof z !== "string" || !US_ZIP_PATTERN.test(z)) {
      return { ok: false };
    }
    zip = z;
  }

  const items = body.items;
  if (!Array.isArray(items) || items.length < 1) {
    return { ok: false };
  }

  const normalizedItems: NormalizedCheckoutItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = validateItem(items[i]);
    if (!item) return { ok: false };
    normalizedItems.push(item);
  }

  return {
    ok: true,
    data: {
      productPrice,
      isDeliver,
      zip,
      items: normalizedItems,
    },
  };
}
