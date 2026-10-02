import { ACTIVE_DATASET } from '../generator.config';
import { DeterministicRandom } from '../deterministic-random';
import { generateReferenceData } from '../reference-data/reference-data';
import type { Product, Warehouse } from '../reference-data/types';

// ─── Exported interfaces ────────────────────────────────────────────────────

export type InventoryEventType =
  | 'initial_stock'
  | 'restock'
  | 'shortage_start'
  | 'shortage_end'
  | 'adjustment';

export interface InventoryEvent {
  inventoryEventId: number;
  productId: number;
  warehouseId: number;
  eventDate: string;
  eventType: InventoryEventType;
  stockLevelAfter: number;
}

export interface InventoryData {
  inventoryEvents: InventoryEvent[];
}

// ─── V1 business constants ──────────────────────────────────────────────────

/** Valid event types matching migration 013 CHECK constraint. */
export const VALID_EVENT_TYPES: InventoryEventType[] = [
  'initial_stock',
  'restock',
  'shortage_start',
  'shortage_end',
  'adjustment',
];

/**
 * Mumbai DC Home Goods shortage event.
 *
 * Matches the demand-suppression constants in order-generator.ts:
 *   MUMBAI_WAREHOUSE_ID = 4
 *   SHORTAGE_START = '2025-08-01'
 *   SHORTAGE_END = '2025-08-22'
 *
 * The warehouse ID is resolved from reference data by name rather than
 * hardcoded, so this remains correct if warehouse IDs ever change.
 */
export const SHORTAGE_WAREHOUSE_NAME = 'Mumbai DC';
export const SHORTAGE_CATEGORY_NAME = 'Home Goods';
export const SHORTAGE_START_DATE = '2025-08-01';
export const SHORTAGE_END_DATE = '2025-08-22';

/**
 * Proportion of Home Goods products at Mumbai DC that are affected by the
 * shortage. At 1,500 products with ~6 categories, expect ~250 Home Goods
 * products; 60% affected ≈ 150 products — a strong analytical signal.
 *
 * Threshold: nextInt(1, 100) <= 60 → affected.
 */
const SHORTAGE_AFFECTED_THRESHOLD = 60;

/** Restock interval: approximately one restock every RESTOCK_INTERVAL_DAYS days. */
const RESTOCK_INTERVAL_DAYS = 45;

/** Days of jitter applied to restock dates (±). */
const RESTOCK_JITTER_DAYS = 10;

// ─── Exported pure helper functions ────────────────────────────────────────

/**
 * Returns whether a Home Goods product at Mumbai DC is affected by the
 * shortage event. Uses a deterministic draw per product.
 *
 * Consumes exactly one random draw.
 */
export function isShortageAffected(random: DeterministicRandom): boolean {
  return random.nextInt(1, 100) <= SHORTAGE_AFFECTED_THRESHOLD;
}

/**
 * Returns the Mumbai DC warehouse from reference data.
 * Throws if not found (should never happen with valid reference data).
 */
export function findMumbaiWarehouse(warehouses: Warehouse[]): Warehouse {
  const wh = warehouses.find((w) => w.warehouseName === SHORTAGE_WAREHOUSE_NAME);
  if (!wh) throw new Error(`Warehouse "${SHORTAGE_WAREHOUSE_NAME}" not found in reference data`);
  return wh;
}

/**
 * Generates the inventory event timeline for a single product/warehouse pair.
 *
 * Timeline structure:
 *   1. initial_stock — on the product's launch date (or dataset start if earlier)
 *   2. periodic restocks — every ~45 days (with jitter)
 *   3. if shortage-affected: shortage_start, shortage_end, recovery restock
 *   4. restocks skip the shortage window for affected pairs
 *
 * All events are returned in chronological order.
 * Consumes random draws for initial stock level, restock levels, jitter.
 */
export function generateProductWarehouseTimeline(
  random: DeterministicRandom,
  product: Product,
  warehouse: Warehouse,
  isAffected: boolean,
): Omit<InventoryEvent, 'inventoryEventId'>[] {
  const events: Omit<InventoryEvent, 'inventoryEventId'>[] = [];
  const DAY_MS = 86_400_000;

  const datasetStartMs = Date.parse(`${ACTIVE_DATASET.datasetStartDate}T00:00:00Z`);
  const asOfMs = Date.parse(`${ACTIVE_DATASET.asOfDate}T00:00:00Z`);
  const launchMs = Date.parse(`${product.launchDate}T00:00:00Z`);

  // Timeline starts at the later of dataset start or product launch
  const timelineStartMs = Math.max(datasetStartMs, launchMs);
  const timelineStartDate = new Date(timelineStartMs).toISOString().slice(0, 10);

  // 1. Initial stock
  const initialStock = random.nextInt(50, 500);
  events.push({
    productId: product.productId,
    warehouseId: warehouse.warehouseId,
    eventDate: timelineStartDate,
    eventType: 'initial_stock',
    stockLevelAfter: initialStock,
  });

  let currentStock = initialStock;

  // Shortage window dates (only relevant if affected)
  const shortageStartMs = Date.parse(`${SHORTAGE_START_DATE}T00:00:00Z`);
  const shortageEndMs = Date.parse(`${SHORTAGE_END_DATE}T00:00:00Z`);

  // 2. Generate periodic restocks
  const intervalMs = RESTOCK_INTERVAL_DAYS * DAY_MS;
  let cursorMs = timelineStartMs + intervalMs;

  while (cursorMs <= asOfMs) {
    // Apply jitter
    const jitterDays = random.nextInt(-RESTOCK_JITTER_DAYS, RESTOCK_JITTER_DAYS);
    const eventMs = cursorMs + jitterDays * DAY_MS;

    // Clamp to valid range
    if (eventMs > timelineStartMs && eventMs <= asOfMs) {
      const eventDate = new Date(eventMs).toISOString().slice(0, 10);

      if (isAffected) {
        // Skip restocks during the shortage window
        if (eventMs >= shortageStartMs && eventMs <= shortageEndMs) {
          cursorMs += intervalMs;
          continue;
        }

        // Insert shortage events just before the first restock that falls
        // on or after the shortage start date
        if (eventMs > shortageEndMs && events.every((e) => e.eventType !== 'shortage_start')) {
          // shortage_start
          events.push({
            productId: product.productId,
            warehouseId: warehouse.warehouseId,
            eventDate: SHORTAGE_START_DATE,
            eventType: 'shortage_start',
            stockLevelAfter: 0,
          });
          currentStock = 0;

          // shortage_end
          events.push({
            productId: product.productId,
            warehouseId: warehouse.warehouseId,
            eventDate: SHORTAGE_END_DATE,
            eventType: 'shortage_end',
            stockLevelAfter: 0,
          });

          // Recovery restock immediately after shortage end
          const recoveryStock = random.nextInt(80, 300);
          currentStock = recoveryStock;
          // Recovery date: 1 day after shortage end
          const recoveryMs = shortageEndMs + DAY_MS;
          if (recoveryMs <= asOfMs) {
            events.push({
              productId: product.productId,
              warehouseId: warehouse.warehouseId,
              eventDate: new Date(recoveryMs).toISOString().slice(0, 10),
              eventType: 'restock',
              stockLevelAfter: recoveryStock,
            });
          }
        }
      }

      // Normal restock
      const restockAmount = random.nextInt(30, 200);
      currentStock += restockAmount;
      events.push({
        productId: product.productId,
        warehouseId: warehouse.warehouseId,
        eventDate: eventDate,
        eventType: 'restock',
        stockLevelAfter: currentStock,
      });
    }

    cursorMs += intervalMs;
  }

  // For affected products whose timeline ended before reaching the shortage
  // window (e.g., product launched after the shortage), we still need shortage
  // events if the product existed before the shortage start.
  if (isAffected && events.every((e) => e.eventType !== 'shortage_start')) {
    if (timelineStartMs <= shortageStartMs && shortageStartMs <= asOfMs) {
      events.push({
        productId: product.productId,
        warehouseId: warehouse.warehouseId,
        eventDate: SHORTAGE_START_DATE,
        eventType: 'shortage_start',
        stockLevelAfter: 0,
      });
      currentStock = 0;

      events.push({
        productId: product.productId,
        warehouseId: warehouse.warehouseId,
        eventDate: SHORTAGE_END_DATE,
        eventType: 'shortage_end',
        stockLevelAfter: 0,
      });

      const recoveryStock = random.nextInt(80, 300);
      currentStock = recoveryStock;
      const recoveryMs = shortageEndMs + DAY_MS;
      if (recoveryMs <= asOfMs) {
        events.push({
          productId: product.productId,
          warehouseId: warehouse.warehouseId,
          eventDate: new Date(recoveryMs).toISOString().slice(0, 10),
          eventType: 'restock',
          stockLevelAfter: recoveryStock,
        });
      }
    }
  }

  // Sort chronologically (stable by insertion order for same-date events)
  events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  return events;
}

// ─── Main generator ─────────────────────────────────────────────────────────

/**
 * Generates deterministic inventory events for all product/warehouse pairs.
 *
 * Every product gets inventory events at every warehouse. The Mumbai DC
 * Home Goods shortage (2025-08-01 → 2025-08-22) is represented via
 * shortage_start / shortage_end events for deterministically selected
 * Home Goods products.
 *
 * All randomness flows through a DeterministicRandom instance seeded with
 * a distinct derived seed (seed + 700) to isolate the inventory RNG
 * sequence from other generators.
 *
 * Does NOT connect to PostgreSQL.
 */
export function generateInventoryData(seed: number = ACTIVE_DATASET.seed): InventoryData {
  const random = new DeterministicRandom(seed + 700);
  const ref = generateReferenceData(seed);

  const mumbaiWarehouse = findMumbaiWarehouse(ref.warehouses);
  const homeGoodsCategory = ref.productCategories.find(
    (c) => c.categoryName === SHORTAGE_CATEGORY_NAME,
  )!;

  const allEvents: InventoryEvent[] = [];
  let eventId = 1;

  // Pre-determine which Home Goods products are shortage-affected at Mumbai DC.
  // Uses a separate RNG pass so the shortage selection is independent of
  // the per-product timeline generation order.
  const shortageRng = new DeterministicRandom(seed + 701);
  const affectedProductIds = new Set<number>();
  const homeGoodsProductIds: number[] = [];
  for (const product of ref.products) {
    if (product.categoryId === homeGoodsCategory.categoryId) {
      homeGoodsProductIds.push(product.productId);
      if (isShortageAffected(shortageRng)) {
        affectedProductIds.add(product.productId);
      }
    }
  }
  // Guarantee at least one Home Goods product is affected for every seed.
  // The probabilistic 60% selection makes zero-affected practically impossible
  // at scale, but this floor ensures correctness for every valid seed.
  if (homeGoodsProductIds.length > 0 && affectedProductIds.size === 0) {
    affectedProductIds.add(homeGoodsProductIds[0]);
  }

  // Generate timelines for every product/warehouse pair
  for (const product of ref.products) {
    for (const warehouse of ref.warehouses) {
      const isAffected =
        warehouse.warehouseId === mumbaiWarehouse.warehouseId &&
        product.categoryId === homeGoodsCategory.categoryId &&
        affectedProductIds.has(product.productId);

      const timeline = generateProductWarehouseTimeline(
        random,
        product,
        warehouse,
        isAffected,
      );

      for (const event of timeline) {
        allEvents.push({
          ...event,
          inventoryEventId: eventId++,
        });
      }
    }
  }

  return { inventoryEvents: allEvents };
}

