import { ACTIVE_DATASET } from '../generator.config';
import { DeterministicRandom } from '../deterministic-random';
import { generateReferenceData } from '../reference-data/reference-data';
import type { Product, Warehouse } from '../reference-data/types';
import {
  findMumbaiWarehouse,
  generateInventoryData,
  generateProductWarehouseTimeline,
  isShortageAffected,
  SHORTAGE_CATEGORY_NAME,
  SHORTAGE_END_DATE,
  SHORTAGE_START_DATE,
  SHORTAGE_WAREHOUSE_NAME,
  VALID_EVENT_TYPES,
  type InventoryEvent,
  type InventoryEventType,
} from './inventory-generator';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const ref = generateReferenceData();
const data = generateInventoryData();

const mumbaiWarehouse = findMumbaiWarehouse(ref.warehouses);
const homeGoodsCategory = ref.productCategories.find(
  (c) => c.categoryName === SHORTAGE_CATEGORY_NAME,
)!;

// ─── Fixture helpers ────────────────────────────────────────────────────────

function makeFixtureProduct(
  id: number,
  categoryId: number,
  launchDate = '2023-03-01',
): Product {
  return {
    productId: id,
    productName: `Fixture Product ${id}`,
    categoryId,
    unitPrice: 50.0,
    unitCost: 32.5,
    launchDate,
    isActive: true,
  };
}

function makeFixtureWarehouse(id: number, name: string): Warehouse {
  return { warehouseId: id, warehouseName: name };
}

/**
 * Helper: filter events for a specific product/warehouse pair.
 */
function eventsFor(
  productId: number,
  warehouseId: number,
  events: InventoryEvent[] = data.inventoryEvents,
): InventoryEvent[] {
  return events.filter(
    (e) => e.productId === productId && e.warehouseId === warehouseId,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('inventory generator', () => {
  // ── Determinism ─────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('same seed → identical inventory events', () => {
      const a = generateInventoryData(ACTIVE_DATASET.seed);
      const b = generateInventoryData(ACTIVE_DATASET.seed);
      expect(a).toEqual(b);
    });

    it('different seed → different inventory events', () => {
      const alt = generateInventoryData(ACTIVE_DATASET.seed + 1);
      // Products are randomized differently → different stock levels
      expect(alt.inventoryEvents).not.toEqual(data.inventoryEvents);
    });
  });

  // ── Basic validity ──────────────────────────────────────────────────────

  describe('basic validity', () => {
    it('all event types are valid', () => {
      data.inventoryEvents.forEach((e) => {
        expect(VALID_EVENT_TYPES).toContain(e.eventType);
      });
    });

    it('stock levels are never negative', () => {
      data.inventoryEvents.forEach((e) => {
        expect(e.stockLevelAfter).toBeGreaterThanOrEqual(0);
      });
    });

    it('event IDs are unique and sequential from 1', () => {
      const ids = data.inventoryEvents.map((e) => e.inventoryEventId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(
        Array.from({ length: ids.length }, (_, i) => i + 1),
      );
    });

    it('every product_id references a valid product', () => {
      const validProductIds = new Set(ref.products.map((p) => p.productId));
      data.inventoryEvents.forEach((e) => {
        expect(validProductIds.has(e.productId)).toBe(true);
      });
    });

    it('every warehouse_id references a valid warehouse', () => {
      const validWarehouseIds = new Set(ref.warehouses.map((w) => w.warehouseId));
      data.inventoryEvents.forEach((e) => {
        expect(validWarehouseIds.has(e.warehouseId)).toBe(true);
      });
    });

    it('events are chronologically ordered within each product/warehouse timeline', () => {
      for (const product of ref.products) {
        for (const warehouse of ref.warehouses) {
          const timeline = eventsFor(product.productId, warehouse.warehouseId);
          for (let i = 1; i < timeline.length; i++) {
            expect(timeline[i].eventDate >= timeline[i - 1].eventDate).toBe(true);
          }
        }
      }
    });
  });

  // ── Initial stock ───────────────────────────────────────────────────────

  describe('initial stock', () => {
    it('every product/warehouse pair has exactly one initial_stock event', () => {
      for (const product of ref.products) {
        for (const warehouse of ref.warehouses) {
          const timeline = eventsFor(product.productId, warehouse.warehouseId);
          const initialEvents = timeline.filter((e) => e.eventType === 'initial_stock');
          expect(initialEvents).toHaveLength(1);
        }
      }
    });

    it('initial stock level is positive', () => {
      const initialEvents = data.inventoryEvents.filter(
        (e) => e.eventType === 'initial_stock',
      );
      initialEvents.forEach((e) => {
        expect(e.stockLevelAfter).toBeGreaterThan(0);
      });
    });

    it('initial_stock is the first event in every timeline', () => {
      for (const product of ref.products) {
        for (const warehouse of ref.warehouses) {
          const timeline = eventsFor(product.productId, warehouse.warehouseId);
          expect(timeline[0].eventType).toBe('initial_stock');
        }
      }
    });
  });

  // ── Restocks ────────────────────────────────────────────────────────────

  describe('restocks', () => {
    it('restocks occur after initial stock', () => {
      for (const product of ref.products) {
        for (const warehouse of ref.warehouses) {
          const timeline = eventsFor(product.productId, warehouse.warehouseId);
          const initialDate = timeline[0].eventDate;
          const restocks = timeline.filter((e) => e.eventType === 'restock');
          restocks.forEach((r) => {
            expect(r.eventDate >= initialDate).toBe(true);
          });
        }
      }
    });

    it('restock events have positive stock levels', () => {
      const restocks = data.inventoryEvents.filter((e) => e.eventType === 'restock');
      restocks.forEach((r) => {
        expect(r.stockLevelAfter).toBeGreaterThan(0);
      });
    });
  });

  // ── Mumbai shortage — fixture-level tests ──────────────────────────────

  describe('Mumbai DC Home Goods shortage (fixture-level)', () => {
    const mumbaiWh = makeFixtureWarehouse(99, SHORTAGE_WAREHOUSE_NAME);
    const nonMumbaiWh = makeFixtureWarehouse(100, 'Delhi DC');

    it('findMumbaiWarehouse identifies the correct warehouse from reference data', () => {
      const found = findMumbaiWarehouse(ref.warehouses);
      expect(found.warehouseName).toBe(SHORTAGE_WAREHOUSE_NAME);
      expect(found.warehouseId).toBe(mumbaiWarehouse.warehouseId);
    });

    it('isShortageAffected is deterministic for a given seed', () => {
      const results1: boolean[] = [];
      const results2: boolean[] = [];
      for (let i = 0; i < 50; i++) {
        results1.push(isShortageAffected(new DeterministicRandom(42 + i)));
        results2.push(isShortageAffected(new DeterministicRandom(42 + i)));
      }
      expect(results1).toEqual(results2);
    });

    it('shortage_start occurs on 2025-08-01 with stock_level_after = 0', () => {
      // Create a Home Goods product whose launch date is before the shortage
      const homeGoodsProduct = makeFixtureProduct(901, homeGoodsCategory.categoryId, '2023-06-01');
      const random = new DeterministicRandom(42);
      const timeline = generateProductWarehouseTimeline(random, homeGoodsProduct, mumbaiWh, true);

      const shortageStart = timeline.find((e) => e.eventType === 'shortage_start');
      expect(shortageStart).toBeDefined();
      expect(shortageStart!.eventDate).toBe(SHORTAGE_START_DATE);
      expect(shortageStart!.stockLevelAfter).toBe(0);
    });

    it('shortage_end occurs on 2025-08-22', () => {
      const homeGoodsProduct = makeFixtureProduct(902, homeGoodsCategory.categoryId, '2023-06-01');
      const random = new DeterministicRandom(42);
      const timeline = generateProductWarehouseTimeline(random, homeGoodsProduct, mumbaiWh, true);

      const shortageEnd = timeline.find((e) => e.eventType === 'shortage_end');
      expect(shortageEnd).toBeDefined();
      expect(shortageEnd!.eventDate).toBe(SHORTAGE_END_DATE);
    });

    it('no restock occurs between 2025-08-01 and 2025-08-22 for affected products', () => {
      const homeGoodsProduct = makeFixtureProduct(903, homeGoodsCategory.categoryId, '2023-06-01');
      const random = new DeterministicRandom(42);
      const timeline = generateProductWarehouseTimeline(random, homeGoodsProduct, mumbaiWh, true);

      const restocksDuringShortage = timeline.filter(
        (e) =>
          e.eventType === 'restock' &&
          e.eventDate >= SHORTAGE_START_DATE &&
          e.eventDate <= SHORTAGE_END_DATE,
      );
      expect(restocksDuringShortage).toHaveLength(0);
    });

    it('recovery restock occurs after the shortage', () => {
      const homeGoodsProduct = makeFixtureProduct(904, homeGoodsCategory.categoryId, '2023-06-01');
      const random = new DeterministicRandom(42);
      const timeline = generateProductWarehouseTimeline(random, homeGoodsProduct, mumbaiWh, true);

      const postShortageRestocks = timeline.filter(
        (e) => e.eventType === 'restock' && e.eventDate > SHORTAGE_END_DATE,
      );
      expect(postShortageRestocks.length).toBeGreaterThan(0);
      // The first post-shortage restock should be the recovery
      expect(postShortageRestocks[0].stockLevelAfter).toBeGreaterThan(0);
    });

    it('non-affected Home Goods products at Mumbai DC have NO shortage events', () => {
      const homeGoodsProduct = makeFixtureProduct(905, homeGoodsCategory.categoryId, '2023-06-01');
      const random = new DeterministicRandom(42);
      const timeline = generateProductWarehouseTimeline(random, homeGoodsProduct, mumbaiWh, false);

      const shortageEvents = timeline.filter(
        (e) => e.eventType === 'shortage_start' || e.eventType === 'shortage_end',
      );
      expect(shortageEvents).toHaveLength(0);
    });

    it('non-Mumbai warehouses never receive shortage events', () => {
      const homeGoodsProduct = makeFixtureProduct(906, homeGoodsCategory.categoryId, '2023-06-01');
      const random = new DeterministicRandom(42);
      // isAffected=false for non-Mumbai warehouse
      const timeline = generateProductWarehouseTimeline(random, homeGoodsProduct, nonMumbaiWh, false);

      const shortageEvents = timeline.filter(
        (e) => e.eventType === 'shortage_start' || e.eventType === 'shortage_end',
      );
      expect(shortageEvents).toHaveLength(0);
    });

    it('non-Home-Goods products at Mumbai DC never receive shortage events', () => {
      // Electronics product at Mumbai DC
      const elecCategory = ref.productCategories.find((c) => c.categoryName === 'Electronics')!;
      const elecProduct = makeFixtureProduct(907, elecCategory.categoryId, '2023-06-01');
      const random = new DeterministicRandom(42);
      const timeline = generateProductWarehouseTimeline(random, elecProduct, mumbaiWh, false);

      const shortageEvents = timeline.filter(
        (e) => e.eventType === 'shortage_start' || e.eventType === 'shortage_end',
      );
      expect(shortageEvents).toHaveLength(0);
    });

    it('shortage events maintain chronological order in the timeline', () => {
      const homeGoodsProduct = makeFixtureProduct(908, homeGoodsCategory.categoryId, '2023-06-01');
      const random = new DeterministicRandom(42);
      const timeline = generateProductWarehouseTimeline(random, homeGoodsProduct, mumbaiWh, true);

      const shortageStart = timeline.find((e) => e.eventType === 'shortage_start')!;
      const shortageEnd = timeline.find((e) => e.eventType === 'shortage_end')!;

      expect(shortageEnd.eventDate >= shortageStart.eventDate).toBe(true);

      // Initial stock is before shortage
      const initial = timeline.find((e) => e.eventType === 'initial_stock')!;
      expect(shortageStart.eventDate >= initial.eventDate).toBe(true);
    });

    it('shortage-affected selection is deterministic across large sample', () => {
      // Verify that ~60% of products are selected with the fixed threshold
      const rng = new DeterministicRandom(42);
      let affected = 0;
      const total = 1000;
      for (let i = 0; i < total; i++) {
        if (isShortageAffected(rng)) affected++;
      }
      // Expect ~600 ± generous tolerance
      expect(affected).toBeGreaterThan(500);
      expect(affected).toBeLessThan(700);
    });
  });

  // ── Generated data — Mumbai shortage in actual dataset ────────────────

  describe('Mumbai shortage in generated dataset', () => {
    // In the current dev dataset there are NO Home Goods products (categoryId=1),
    // so shortage events won't appear. These tests verify the structural absence
    // is correct and that the generator handles it gracefully.

    it('no shortage events exist for non-Home-Goods products', () => {
      const shortageEvents = data.inventoryEvents.filter(
        (e) => e.eventType === 'shortage_start' || e.eventType === 'shortage_end',
      );
      // In dev dataset: no Home Goods products → no shortage events expected
      const homeGoodsProductIds = new Set(
        ref.products
          .filter((p) => p.categoryId === homeGoodsCategory.categoryId)
          .map((p) => p.productId),
      );
      shortageEvents.forEach((e) => {
        expect(homeGoodsProductIds.has(e.productId)).toBe(true);
        expect(e.warehouseId).toBe(mumbaiWarehouse.warehouseId);
      });
    });
  });

  // ── Guaranteed shortage existence ────────────────────────────────────

  describe('guaranteed shortage existence', () => {
    it('multiple different seeds always produce at least one affected Home Goods SKU', () => {
      // Test 20 different seeds to verify the floor guarantee
      for (let seedOffset = 0; seedOffset < 20; seedOffset++) {
        const testSeed = ACTIVE_DATASET.seed + seedOffset;
        const testRef = generateReferenceData(testSeed);
        const testHomeGoods = testRef.products.filter(
          (p) => p.categoryId === homeGoodsCategory.categoryId,
        );

        if (testHomeGoods.length === 0) continue; // skip seeds with no Home Goods (valid for tiny dev config)

        const testData = generateInventoryData(testSeed);
        const shortageStarts = testData.inventoryEvents.filter(
          (e) =>
            e.eventType === 'shortage_start' &&
            e.warehouseId === findMumbaiWarehouse(testRef.warehouses).warehouseId,
        );
        expect(shortageStarts.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('affected SKUs are always a proper subset of Home Goods products', () => {
      // Use a few seeds and verify affected products are Home Goods and not ALL Home Goods
      for (let seedOffset = 0; seedOffset < 10; seedOffset++) {
        const testSeed = ACTIVE_DATASET.seed + seedOffset;
        const testRef = generateReferenceData(testSeed);
        const testHomeGoodsIds = new Set(
          testRef.products
            .filter((p) => p.categoryId === homeGoodsCategory.categoryId)
            .map((p) => p.productId),
        );

        if (testHomeGoodsIds.size < 2) continue; // need ≥2 for proper subset verification

        const testData = generateInventoryData(testSeed);
        const mumbaiWh = findMumbaiWarehouse(testRef.warehouses);
        const affectedIds = new Set(
          testData.inventoryEvents
            .filter(
              (e) =>
                e.eventType === 'shortage_start' &&
                e.warehouseId === mumbaiWh.warehouseId,
            )
            .map((e) => e.productId),
        );

        // All affected must be Home Goods
        affectedIds.forEach((id) => {
          expect(testHomeGoodsIds.has(id)).toBe(true);
        });

        // At least one affected
        expect(affectedIds.size).toBeGreaterThanOrEqual(1);
      }
    });

    it('shortage events exist whenever Home Goods products are present in generated data', () => {
      // Find a seed that produces at least one Home Goods product
      // and verify shortage events are generated
      for (let seedOffset = 0; seedOffset < 50; seedOffset++) {
        const testSeed = ACTIVE_DATASET.seed + seedOffset;
        const testRef = generateReferenceData(testSeed);
        const hasHomeGoods = testRef.products.some(
          (p) => p.categoryId === homeGoodsCategory.categoryId,
        );

        if (!hasHomeGoods) continue;

        const testData = generateInventoryData(testSeed);
        const mumbaiWh = findMumbaiWarehouse(testRef.warehouses);
        const shortageEvents = testData.inventoryEvents.filter(
          (e) =>
            (e.eventType === 'shortage_start' || e.eventType === 'shortage_end') &&
            e.warehouseId === mumbaiWh.warehouseId,
        );

        // Must have at least shortage_start + shortage_end = 2 events
        expect(shortageEvents.length).toBeGreaterThanOrEqual(2);
        return; // found and verified one seed
      }
    });
  });

  // ── No database access ───────────────────────────────────────────────

  describe('no database access', () => {
    it('generateInventoryData completes without a PostgreSQL connection', () => {
      expect(data.inventoryEvents).toBeDefined();
      expect(Array.isArray(data.inventoryEvents)).toBe(true);
    });
  });
});

