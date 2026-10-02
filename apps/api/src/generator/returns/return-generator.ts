import { ACTIVE_DATASET } from '../generator.config';
import { DeterministicRandom } from '../deterministic-random';
import { generateReferenceData } from '../reference-data/reference-data';
import { generateOrderData } from '../orders/order-generator';
import type { Product } from '../reference-data/types';
import type { Order, OrderItem } from '../orders/order-generator';

// ─── Exported interfaces ────────────────────────────────────────────────────

export interface Return {
  returnId: number;
  orderItemId: number;
  returnDate: string;
  processedDate: string;
  reason: ReturnReason;
  refundAmount: number;
}

export type ReturnReason = 'defective' | 'wrong_item' | 'changed_mind' | 'not_as_described';

export interface ReturnData {
  returns: Return[];
}

// ─── V1 business constants ──────────────────────────────────────────────────

/** Valid return reasons matching migration 012 CHECK constraint. */
export const VALID_REASONS: ReturnReason[] = [
  'defective',
  'wrong_item',
  'changed_mind',
  'not_as_described',
];

/**
 * Category return-rate probabilities (per 1000).
 * Used as thresholds against a nextInt(1, 1000) draw.
 *
 * V1 frozen specification:
 *   Apparel               ≈ 12 %
 *   Beauty & Personal Care ≈ 8 %
 *   Kitchen & Dining       ≈ 5 %
 *   Home Goods             ≈ 6 %
 *   Electronics            ≈ 3 %
 *   Sporting Goods         ≈ 4 %
 */
export const CATEGORY_RETURN_RATES: Record<string, number> = {
  'Apparel': 120,
  'Beauty & Personal Care': 80,
  'Kitchen & Dining': 50,
  'Home Goods': 60,
  'Electronics': 30,
  'Sporting Goods': 40,
};

/** Default return rate (per 1000) for unknown categories. */
const DEFAULT_RETURN_RATE = 50;

/**
 * AquaFlow Blender quality event.
 *
 * V1 specification: the AquaFlow Blender product (Kitchen & Dining category)
 * experiences an elevated defective-return rate during July 15 – September 15, 2025.
 *
 * Normal Kitchen & Dining return rate: ≈5 % of items
 * AquaFlow Blender during event: ≈25 % defective return rate
 *
 * This event applies ONLY to the AquaFlow Blender product.
 * Other Kitchen & Dining products retain their normal return behavior
 * even during the event window.
 */
export const AQUAFLOW_PRODUCT_NAME = 'AquaFlow Blender';
export const AQUAFLOW_EVENT_START = '2025-07-15';
export const AQUAFLOW_EVENT_END = '2025-09-15';
const AQUAFLOW_EVENT_RETURN_RATE = 250; // ≈25 % of items returned as defective

/**
 * Reason probability weights (out of 100).
 *
 * changed_mind is the most common reason at scale.
 *   changed_mind      40 %
 *   not_as_described   25 %
 *   defective          20 %
 *   wrong_item         15 %
 */
const REASON_WEIGHTS: [ReturnReason, number][] = [
  ['changed_mind', 40],
  ['not_as_described', 25],
  ['defective', 20],
  ['wrong_item', 15],
];

/** Maximum processing delay in days after return_date. */
const MAX_PROCESSING_DELAY_DAYS = 14;

// ─── Exported pure helper functions ────────────────────────────────────────

/**
 * Returns the return probability (per 1000) for an order item based on its
 * product category and order date.
 *
 * During the AquaFlow quality event window, the AquaFlow Blender product
 * uses an elevated rate of 250/1000 (≈25 %).
 * Other Kitchen & Dining products are NOT affected by this event.
 */
export function getReturnRate(
  categoryName: string,
  orderDate: string,
  productName: string,
): number {
  // AquaFlow Blender quality event: specific product during event window
  if (
    productName === AQUAFLOW_PRODUCT_NAME &&
    orderDate >= AQUAFLOW_EVENT_START &&
    orderDate <= AQUAFLOW_EVENT_END
  ) {
    return AQUAFLOW_EVENT_RETURN_RATE;
  }

  return CATEGORY_RETURN_RATES[categoryName] ?? DEFAULT_RETURN_RATE;
}

/**
 * Returns whether a return should be generated for this item.
 * Consumes exactly one random draw (nextInt(1, 1000)).
 */
export function shouldReturn(
  random: DeterministicRandom,
  returnRate: number,
): boolean {
  return random.nextInt(1, 1000) <= returnRate;
}

/**
 * Determines the return reason.
 *
 * During the AquaFlow quality event, AquaFlow Blender returns are
 * 'defective' (the elevated rate already targets the ≈25 % defective
 * probability; forcing the reason ensures the full 25 % manifests as
 * defective rather than being diluted across reason categories).
 *
 * Other Kitchen & Dining products use normal reason selection even
 * during the event window.
 *
 * Consumes exactly one random draw when not in the event path.
 * Consumes zero random draws when the AquaFlow event forces 'defective'.
 */
export function selectReason(
  random: DeterministicRandom,
  orderDate: string,
  productName: string,
): ReturnReason {
  // AquaFlow event: force defective reason for this specific product
  if (
    productName === AQUAFLOW_PRODUCT_NAME &&
    orderDate >= AQUAFLOW_EVENT_START &&
    orderDate <= AQUAFLOW_EVENT_END
  ) {
    return 'defective';
  }

  // Weighted random selection among the four reasons
  const totalWeight = REASON_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let draw = random.nextInt(1, totalWeight);
  for (const [reason, weight] of REASON_WEIGHTS) {
    draw -= weight;
    if (draw <= 0) return reason;
  }
  return REASON_WEIGHTS[REASON_WEIGHTS.length - 1][0];
}

/**
 * Generates deterministic return and processed dates.
 *
 * return_date: 1–30 days after the order date (constrained to asOfDate).
 * processed_date: 1–MAX_PROCESSING_DELAY_DAYS days after return_date
 *                 (constrained to asOfDate).
 *
 * Consumes exactly two random draws.
 */
export function generateReturnDates(
  random: DeterministicRandom,
  orderDate: string,
): { returnDate: string; processedDate: string } {
  const DAY_MS = 86_400_000;
  const orderMs = Date.parse(`${orderDate}T00:00:00Z`);
  const asOfMs = Date.parse(`${ACTIVE_DATASET.asOfDate}T00:00:00Z`);

  // Return date: 1–30 days after order, capped at asOfDate
  const maxReturnDays = Math.min(30, Math.floor((asOfMs - orderMs) / DAY_MS));
  const returnDays = maxReturnDays >= 1 ? random.nextInt(1, maxReturnDays) : 0;
  const returnMs = Math.min(orderMs + returnDays * DAY_MS, asOfMs);
  const returnDate = new Date(returnMs).toISOString().slice(0, 10);

  // Processed date: 1–14 days after return, capped at asOfDate
  const maxProcessDays = Math.min(
    MAX_PROCESSING_DELAY_DAYS,
    Math.floor((asOfMs - returnMs) / DAY_MS),
  );
  const processDays = maxProcessDays >= 1 ? random.nextInt(1, maxProcessDays) : 0;
  const processedMs = Math.min(returnMs + processDays * DAY_MS, asOfMs);
  const processedDate = new Date(processedMs).toISOString().slice(0, 10);

  return { returnDate, processedDate };
}

/**
 * Calculates refund amount from the order item's purchase economics.
 *
 * refund = unit_price_at_purchase × quantity
 *
 * Uses integer cent arithmetic to avoid floating-point drift.
 * Never reads product.unitPrice (the master price may have changed).
 */
export function calculateRefundAmount(item: OrderItem): number {
  const cents = Math.round(item.unitPriceAtPurchase * 100) * item.quantity;
  return Number((cents / 100).toFixed(2));
}

// ─── Main generator ─────────────────────────────────────────────────────────

/**
 * Generates deterministic returns for all eligible order items.
 *
 * Eligibility:
 *   - Order must be 'completed' (cancelled orders never produce returns).
 *   - Each eligible item is independently evaluated for return using a
 *     category-based probability.
 *
 * The AquaFlow Blender quality event (2025-07-15 → 2025-09-15) elevates
 * the return rate for that SPECIFIC PRODUCT to ≈25 % and forces reason =
 * 'defective'. Other Kitchen & Dining products are NOT affected.
 *
 * All randomness flows through a DeterministicRandom instance seeded with
 * a distinct derived seed (seed + 600) to isolate the return RNG sequence
 * from the order generator's sequence.
 *
 * Does NOT connect to PostgreSQL.
 * Does NOT generate inventory events.
 */
export function generateReturnData(seed: number = ACTIVE_DATASET.seed): ReturnData {
  const random = new DeterministicRandom(seed + 600);
  const ref = generateReferenceData(seed);
  const { orders, orderItems } = generateOrderData(seed);

  // Build lookups
  const orderMap = new Map<number, Order>(orders.map((o) => [o.orderId, o]));
  const productMap = new Map<number, Product>(ref.products.map((p) => [p.productId, p]));
  const categoryMap = new Map<number, string>(
    ref.productCategories.map((c) => [c.categoryId, c.categoryName]),
  );

  const returns: Return[] = [];
  let returnId = 1;

  // Process items in deterministic order (orderItemId ascending)
  for (const item of orderItems) {
    const order = orderMap.get(item.orderId)!;

    // Only completed orders can produce returns
    if (order.orderStatus !== 'completed') continue;

    const product = productMap.get(item.productId)!;
    const categoryName = categoryMap.get(product.categoryId) ?? 'Unknown';

    // Determine return rate (AquaFlow event may elevate it for that specific product)
    const returnRate = getReturnRate(categoryName, order.orderDate, product.productName);

    // Roll for return — consumes one random draw per eligible item
    if (!shouldReturn(random, returnRate)) continue;

    // Reason — consumes one random draw (or zero if AquaFlow event forces 'defective')
    const reason = selectReason(random, order.orderDate, product.productName);

    // Dates — consumes two random draws
    const { returnDate, processedDate } = generateReturnDates(random, order.orderDate);

    // Refund — deterministic from purchase economics
    const refundAmount = calculateRefundAmount(item);

    returns.push({
      returnId: returnId++,
      orderItemId: item.orderItemId,
      returnDate,
      processedDate,
      reason,
      refundAmount,
    });
  }

  return { returns };
}
