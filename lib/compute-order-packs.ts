import type { NormalizedCheckoutItem } from "@/lib/validate-checkout-request";

const INNARDS = /innards/i;
const BABY = /baby/i;

function packsForLine(item: NormalizedCheckoutItem): number {
  const { name, quantity, isBundle, isGift } = item;

  if (isGift) {
    return 10 * quantity;
  }

  if (isBundle) {
    const perUnit = INNARDS.test(name) || BABY.test(name) ? 2 : 3;
    return perUnit * quantity;
  }

  return quantity;
}

export function computeOrderPacks(items: NormalizedCheckoutItem[]): {
  totalPacks: number;
  boxCount: number;
} {
  let totalPacks = 0;
  for (const item of items) {
    totalPacks += packsForLine(item);
  }

  const boxCount = Math.max(1, Math.ceil(totalPacks / 10));

  return { totalPacks, boxCount };
}
