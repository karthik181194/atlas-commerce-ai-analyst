import { DEVELOPMENT_DATASET } from '../generator.config';
import { DeterministicRandom } from '../deterministic-random';
import { generateReferenceData } from '../reference-data/reference-data';
import { generateCustomers } from '../customers/customer-generator';
import { generateCampaignData } from '../campaigns/campaign-generator';
import type { Product, Region } from '../reference-data/types';
import type { Customer } from '../customers/customer-generator';
import type { MarketingCampaign } from '../campaigns/campaign-generator';

// ─── Exported interfaces ────────────────────────────────────────────────────

export interface Order {
  orderId: number;
  customerId: number;
  regionId: number;
  fulfillingWarehouseId: number;
  campaignId: number | null;
  segmentAtOrder: number;
  orderDate: string;
  orderStatus: 'completed' | 'cancelled';
  totalAmount: number;
}

export interface OrderItem {
  orderItemId: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPriceAtPurchase: number;
}

export interface OrderData {
  orders: Order[];
  orderItems: OrderItem[];
}

/**
 * Category IDs used by seasonal and event weighting helpers.
 * Build from reference data by name before calling the helpers.
 */
export interface CategoryIds {
  homeGoods: number;
  electronics: number;
  apparel: number;
  kitchen: number;
}

// ─── V1 business constants ──────────────────────────────────────────────────

/** Hidden event 1: Electronics prices rise 6 % company-wide from this date. */
const ELECTRONICS_PRICE_CHANGE_DATE = '2025-06-01';
const ELECTRONICS_PRICE_MULTIPLIER = 1.06;

/** Hidden event 2: Mumbai DC Home Goods shortage window. */
export const MUMBAI_WAREHOUSE_ID = 4;
const SHORTAGE_START = '2025-08-01';
const SHORTAGE_END = '2025-08-22';
const SHORTAGE_MULTIPLIER = 0.45; // ≈55 % demand reduction

/**
 * Relative order-frequency weights keyed by segment ID.
 * New (1) → fewest orders; Loyal (3) → most orders per customer.
 */
const SEGMENT_FREQUENCY: Record<number, number> = {
  1: 1, // New
  2: 3, // Occasional
  3: 5, // Loyal
  4: 4, // VIP
};

// ─── Exported pure helper functions ────────────────────────────────────────

/**
 * Returns the fulfilling warehouse ID for a region using its pre-mapped
 * defaultWarehouseId:
 *   North → Delhi DC (1)
 *   South → Hyderabad DC (2)
 *   Central → Nagpur DC (3)
 *   West → Mumbai DC (4)
 *   East → Hyderabad DC (2)
 */
export function resolveWarehouseId(regionId: number, regions: Region[]): number {
  const region = regions.find((r) => r.regionId === regionId);
  if (!region) throw new Error(`Unknown regionId: ${regionId}`);
  return region.defaultWarehouseId;
}

/**
 * Returns unit_price_at_purchase for an order item.
 *
 * Hidden event 1: Electronics prices rise 6 % from 2025-06-01.
 * The master product.unitPrice is never modified here.
 */
export function calculateUnitPrice(
  product: Product,
  orderDate: string,
  electronicsCategoryId: number,
): number {
  if (
    product.categoryId === electronicsCategoryId &&
    orderDate >= ELECTRONICS_PRICE_CHANGE_DATE
  ) {
    return Number((product.unitPrice * ELECTRONICS_PRICE_MULTIPLIER).toFixed(2));
  }
  return product.unitPrice;
}

/**
 * Returns the demand multiplier for a product in a given warehouse/date context.
 *
 * Hidden event 2: Mumbai DC Home Goods shortage (2025-08-01 → 2025-08-22)
 * suppresses demand to ≈45 % of normal (≈55 % reduction).
 * All other combinations return 1 (no change).
 */
export function getInventoryShortageMultiplier(
  productCategoryId: number,
  warehouseId: number,
  orderDate: string,
  homeGoodsCategoryId: number,
): number {
  if (
    productCategoryId === homeGoodsCategoryId &&
    warehouseId === MUMBAI_WAREHOUSE_ID &&
    orderDate >= SHORTAGE_START &&
    orderDate <= SHORTAGE_END
  ) {
    return SHORTAGE_MULTIPLIER;
  }
  return 1;
}

/**
 * Returns the seasonal weight for a calendar month used in order-date
 * bucket selection.
 *
 * Q4 (Oct–Dec) receives 150 to reflect the India festive / peak season
 * (≈50 % higher order volume at scale).
 * All other months receive 100.
 */
export function getMonthSeasonalWeight(month: number): number {
  return month >= 10 && month <= 12 ? 150 : 100;
}

/**
 * Returns the composite product-selection weight for a product on a
 * specific order date and fulfilling warehouse.
 *
 * Combines:
 *   • Inverse-rank popularity  — top product gets ≈44 % of draw share
 *   • Weekend uplift           — Apparel & Home Goods +17.5 % (Sat/Sun)
 *   • August demand bump       — Home Goods & Kitchen +10 %
 *   • Inventory shortage       — Mumbai DC Home Goods Aug 1–22: ≈55 % reduction
 *
 * Always returns at least 1 so no product is ever entirely excluded.
 */
export function getSeasonalProductWeight(
  product: Product,
  productIndex: number,
  orderDate: string,
  warehouseId: number,
  categoryIds: CategoryIds,
): number {
  // Base popularity weight: inverse rank (power-law proxy)
  const base = Math.round(100 / (productIndex + 1));

  const month = parseInt(orderDate.slice(5, 7), 10);
  const dayOfWeek = new Date(orderDate + 'T00:00:00Z').getUTCDay(); // 0 = Sun, 6 = Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isAugust = month === 8;

  let multiplier = 100;

  // Weekend uplift: Apparel and Home Goods +17.5 %
  if (
    isWeekend &&
    (product.categoryId === categoryIds.homeGoods ||
      product.categoryId === categoryIds.apparel)
  ) {
    multiplier = Math.round(multiplier * 1.175);
  }

  // August demand bump: Home Goods and Kitchen & Dining +10 %
  if (
    isAugust &&
    (product.categoryId === categoryIds.homeGoods ||
      product.categoryId === categoryIds.kitchen)
  ) {
    multiplier = Math.round(multiplier * 1.1);
  }

  // Inventory shortage: suppress Mumbai DC Home Goods demand in the shortage window
  const shortageMultiplier = getInventoryShortageMultiplier(
    product.categoryId,
    warehouseId,
    orderDate,
    categoryIds.homeGoods,
  );
  if (shortageMultiplier < 1) {
    multiplier = Math.round(multiplier * shortageMultiplier);
  }

  return Math.max(1, Math.round((base * multiplier) / 100));
}

/**
 * Determines which campaign (if any) to attribute to an order.
 *
 * Rules applied in order:
 *   1. Campaign must be active on the order date (startDate ≤ date ≤ endDate).
 *   2. If campaign targets a segment, the customer's segment must match.
 *   3. If campaign targets a region, the customer's region must match.
 *   4. Null on either targeting dimension means "all" (no restriction).
 *   5. Most specific campaign wins (both non-null > one non-null > both null).
 *   6. Ties broken by campaignId ascending.
 *
 * Note: the 7-day analytical attribution tail is NOT encoded here. That is
 * an analytics-layer rule applied at query time, not at data generation time.
 */
export function matchCampaign(
  customer: Customer,
  orderDate: string,
  campaigns: MarketingCampaign[],
): number | null {
  const applicable = campaigns.filter((c) => {
    if (orderDate < c.startDate || orderDate > c.endDate) return false;
    if (c.targetSegmentId !== null && c.targetSegmentId !== customer.segmentId)
      return false;
    if (c.targetRegionId !== null && c.targetRegionId !== customer.regionId)
      return false;
    return true;
  });

  if (applicable.length === 0) return null;

  // Prefer most-targeted campaign; break ties by campaignId ascending
  const sorted = [...applicable].sort((a, b) => {
    const scoreA =
      (a.targetSegmentId !== null ? 1 : 0) + (a.targetRegionId !== null ? 1 : 0);
    const scoreB =
      (b.targetSegmentId !== null ? 1 : 0) + (b.targetRegionId !== null ? 1 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.campaignId - b.campaignId;
  });

  return sorted[0].campaignId;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Weighted random selection. Returns the index of the selected element. */
function selectWeighted(random: DeterministicRandom, weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let draw = random.nextInt(1, total);
  for (let i = 0; i < weights.length; i++) {
    draw -= weights[i];
    if (draw <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Generates a deterministic order date for a customer.
 *
 * Algorithm:
 *   1. Build monthly buckets covering [max(customerSignup, datasetStart), asOfDate].
 *   2. Weight each bucket by getMonthSeasonalWeight (Q4 = 150, other = 100).
 *   3. Pick a bucket with weighted random draw.
 *   4. Pick a uniformly random day within that bucket.
 *
 * This encodes Q4 peak-season behaviour at the date-generation level so the
 * final-scale dataset will exhibit approximately 50 % higher October–December
 * order volume without any post-hoc filtering.
 */
function generateOrderDate(
  random: DeterministicRandom,
  customer: Customer,
): string {
  const datasetStartMs = Date.parse(`${DEVELOPMENT_DATASET.datasetStartDate}T00:00:00Z`);
  const datasetEndMs = Date.parse(`${DEVELOPMENT_DATASET.asOfDate}T00:00:00Z`);
  const customerStartMs = Math.max(
    datasetStartMs,
    Date.parse(`${customer.signupDate}T00:00:00Z`),
  );

  // Edge case: customer joined on or after asOfDate
  if (customerStartMs >= datasetEndMs) {
    return customer.signupDate <= DEVELOPMENT_DATASET.asOfDate
      ? customer.signupDate
      : DEVELOPMENT_DATASET.datasetStartDate;
  }

  interface MonthBucket {
    startDay: number;
    endDay: number;
    weight: number;
  }
  const buckets: MonthBucket[] = [];

  // Align cursor to the first day of the month containing customerStartMs
  let cursor = new Date(customerStartMs);
  cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));

  while (cursor.getTime() <= datasetEndMs) {
    const nextMonthMs = Date.UTC(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      1,
    );
    const bucketStartMs = Math.max(cursor.getTime(), customerStartMs);
    const bucketEndMs = Math.min(nextMonthMs - 86_400_000, datasetEndMs);

    if (bucketStartMs <= bucketEndMs) {
      const month = cursor.getUTCMonth() + 1; // 1–12
      buckets.push({
        startDay: Math.floor(bucketStartMs / 86_400_000),
        endDay: Math.floor(bucketEndMs / 86_400_000),
        weight: getMonthSeasonalWeight(month),
      });
    }

    cursor = new Date(nextMonthMs);
  }

  if (buckets.length === 0) return DEVELOPMENT_DATASET.datasetStartDate;

  const bucket = buckets[selectWeighted(random, buckets.map((b) => b.weight))];
  const day = random.nextInt(bucket.startDay, bucket.endDay);
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

// ─── Main generator ─────────────────────────────────────────────────────────

/**
 * Generates exactly DEVELOPMENT_DATASET.orders orders and their items.
 *
 * All randomness flows through one DeterministicRandom instance seeded with
 * `seed`.  Same seed → identical output; different seed → different output.
 *
 * Does NOT connect to PostgreSQL.
 * Does NOT generate returns or inventory events.
 */
export function generateOrderData(seed: number = DEVELOPMENT_DATASET.seed): OrderData {
  const random = new DeterministicRandom(seed);
  const ref = generateReferenceData(seed);
  const customers = generateCustomers(seed);
  const { campaigns } = generateCampaignData(seed);

  // Build category ID index by name (guaranteed to exist in reference data)
  const findCat = (name: string) =>
    ref.productCategories.find((c) => c.categoryName === name)!;
  const categoryIds: CategoryIds = {
    homeGoods: findCat('Home Goods').categoryId,
    electronics: findCat('Electronics').categoryId,
    apparel: findCat('Apparel').categoryId,
    kitchen: findCat('Kitchen & Dining').categoryId,
  };

  // Customer selection weights: higher-frequency segments get proportionally
  // more orders assigned across the dataset.
  const customerWeights = customers.map((c) => SEGMENT_FREQUENCY[c.segmentId] ?? 2);

  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  let orderItemId = 1;

  for (let orderIdx = 0; orderIdx < DEVELOPMENT_DATASET.orders; orderIdx++) {
    // ── 1. Customer (segment-frequency weighted) ─────────────────────────
    const customerIndex = selectWeighted(random, customerWeights);
    const customer = customers[customerIndex];

    // ── 2. Order date (Q4-biased, constrained to [signup, asOfDate]) ─────
    const orderDate = generateOrderDate(random, customer);

    // ── 3. Region & warehouse snapshots ──────────────────────────────────
    const regionId = customer.regionId;
    const fulfillingWarehouseId = resolveWarehouseId(regionId, ref.regions);

    // ── 4. Status: 80 % completed, 20 % cancelled ────────────────────────
    const orderStatus: 'completed' | 'cancelled' =
      random.nextInt(1, 10) <= 2 ? 'cancelled' : 'completed';

    // ── 5. Campaign attribution ───────────────────────────────────────────
    const campaignId = matchCampaign(customer, orderDate, campaigns);

    // ── 6. Item count: realistic e-commerce small-basket distribution ─────
    const itemCountRoll = random.nextInt(1, 10);
    let itemCount: number;
    if (itemCountRoll <= 5) {
      itemCount = 1; // 50 %
    } else if (itemCountRoll <= 8) {
      itemCount = 2; // 30 %
    } else if (itemCountRoll <= 9) {
      itemCount = 3; // 10 %
    } else {
      itemCount = random.nextInt(4, 5); // 10 %
    }

    // ── 7. Product weights for this order context ─────────────────────────
    const productWeights = ref.products.map((product, index) =>
      getSeasonalProductWeight(
        product,
        index,
        orderDate,
        fulfillingWarehouseId,
        categoryIds,
      ),
    );

    // ── 8. Generate items ─────────────────────────────────────────────────
    const generatedItems: OrderItem[] = [];
    const usedProductIds = new Set<number>();

    for (let itemIdx = 0; itemIdx < itemCount; itemIdx++) {
      // Best-effort duplicate avoidance within the same order
      let productIndex = selectWeighted(random, productWeights);
      if (
        usedProductIds.has(ref.products[productIndex].productId) &&
        ref.products.length > 1
      ) {
        productIndex = selectWeighted(random, productWeights);
      }
      const product = ref.products[productIndex];
      usedProductIds.add(product.productId);

      // Quantity: mostly 1–2 units (realistic for e-commerce)
      const qRoll = random.nextInt(1, 10);
      let quantity: number;
      if (qRoll <= 6) {
        quantity = 1; // 60 %
      } else if (qRoll <= 9) {
        quantity = 2; // 30 %
      } else {
        quantity = random.nextInt(3, 4); // 10 %
      }

      // Price: apply electronics event; master price is never modified
      const unitPriceAtPurchase = calculateUnitPrice(
        product,
        orderDate,
        categoryIds.electronics,
      );

      generatedItems.push({
        orderItemId: orderItemId++,
        orderId: orderIdx + 1,
        productId: product.productId,
        quantity,
        unitPriceAtPurchase,
      });
    }

    // ── 9. Order total (integer cent arithmetic avoids FP drift) ──────────
    const totalCents = generatedItems.reduce(
      (sum, item) =>
        sum + Math.round(item.quantity * item.unitPriceAtPurchase * 100),
      0,
    );
    const totalAmount = Number((totalCents / 100).toFixed(2));

    orders.push({
      orderId: orderIdx + 1,
      customerId: customer.customerId,
      regionId,
      fulfillingWarehouseId,
      campaignId,
      segmentAtOrder: customer.segmentId,
      orderDate,
      orderStatus,
      totalAmount,
    });

    orderItems.push(...generatedItems);
  }

  return { orders, orderItems };
}
