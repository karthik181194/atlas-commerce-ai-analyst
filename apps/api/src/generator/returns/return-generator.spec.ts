import { ACTIVE_DATASET } from '../generator.config';
import { DeterministicRandom } from '../deterministic-random';
import { generateReferenceData } from '../reference-data/reference-data';
import { generateOrderData } from '../orders/order-generator';
import type { Product } from '../reference-data/types';
import type { OrderItem, Order } from '../orders/order-generator';
import {
  calculateRefundAmount,
  generateReturnData,
  generateReturnDates,
  getReturnRate,
  selectReason,
  shouldReturn,
  AQUAFLOW_PRODUCT_NAME,
  AQUAFLOW_EVENT_START,
  AQUAFLOW_EVENT_END,
  CATEGORY_RETURN_RATES,
  VALID_REASONS,
  type ReturnReason,
} from './return-generator';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const ref = generateReferenceData();
const { orders, orderItems } = generateOrderData();
const data = generateReturnData();

// Lookups
const orderMap = new Map<number, Order>(orders.map((o) => [o.orderId, o]));
const orderItemMap = new Map<number, OrderItem>(orderItems.map((i) => [i.orderItemId, i]));
const productMap = new Map<number, Product>(ref.products.map((p) => [p.productId, p]));
const categoryMap = new Map<number, string>(
  ref.productCategories.map((c) => [c.categoryId, c.categoryName]),
);

const completedOrderIds = new Set(
  orders.filter((o) => o.orderStatus === 'completed').map((o) => o.orderId),
);
const cancelledOrderIds = new Set(
  orders.filter((o) => o.orderStatus === 'cancelled').map((o) => o.orderId),
);
const completedItemIds = new Set(
  orderItems.filter((i) => completedOrderIds.has(i.orderId)).map((i) => i.orderItemId),
);

// AquaFlow Blender product reference
const aquaflowProduct = ref.products.find((p) => p.productName === AQUAFLOW_PRODUCT_NAME)!;
const kitchenCat = ref.productCategories.find((c) => c.categoryName === 'Kitchen & Dining')!;

// ─── Fixture helpers ────────────────────────────────────────────────────────

function makeFixtureItem(
  orderItemId: number,
  orderId: number,
  productId: number,
  quantity: number,
  unitPriceAtPurchase: number,
): OrderItem {
  return { orderItemId, orderId, productId, quantity, unitPriceAtPurchase };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('return generator', () => {
  // ── Determinism ─────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('same seed → identical returns on repeated calls', () => {
      const a = generateReturnData(ACTIVE_DATASET.seed);
      const b = generateReturnData(ACTIVE_DATASET.seed);
      expect(a).toEqual(b);
    });

    it('different seed → different returns', () => {
      const alt = generateReturnData(ACTIVE_DATASET.seed + 1);
      expect(alt).not.toEqual(data);
    });
  });

  // ── Referential integrity ───────────────────────────────────────────────

  describe('referential integrity', () => {
    it('every return references an existing order item', () => {
      const validItemIds = new Set(orderItems.map((i) => i.orderItemId));
      data.returns.forEach((r) => {
        expect(validItemIds.has(r.orderItemId)).toBe(true);
      });
    });

    it('every returned order item belongs to a completed order', () => {
      data.returns.forEach((r) => {
        expect(completedItemIds.has(r.orderItemId)).toBe(true);
      });
    });

    it('cancelled orders never produce returns', () => {
      const cancelledItemIds = new Set(
        orderItems.filter((i) => cancelledOrderIds.has(i.orderId)).map((i) => i.orderItemId),
      );
      data.returns.forEach((r) => {
        expect(cancelledItemIds.has(r.orderItemId)).toBe(false);
      });
    });

    it('return IDs are unique and sequential from 1', () => {
      const ids = data.returns.map((r) => r.returnId);
      expect(new Set(ids).size).toBe(ids.length);
      if (ids.length > 0) {
        expect(ids).toEqual(
          Array.from({ length: ids.length }, (_, i) => i + 1),
        );
      }
    });

    it('no order item has more than one return', () => {
      const itemIds = data.returns.map((r) => r.orderItemId);
      expect(new Set(itemIds).size).toBe(itemIds.length);
    });
  });

  // ── Date validity ──────────────────────────────────────────────────────

  describe('date validity', () => {
    it('return_date >= order_date for every return', () => {
      data.returns.forEach((r) => {
        const item = orderItemMap.get(r.orderItemId)!;
        const order = orderMap.get(item.orderId)!;
        expect(r.returnDate >= order.orderDate).toBe(true);
      });
    });

    it('processed_date >= return_date for every return', () => {
      data.returns.forEach((r) => {
        expect(r.processedDate >= r.returnDate).toBe(true);
      });
    });

    it('dates remain within the configured dataset boundaries', () => {
      data.returns.forEach((r) => {
        expect(r.returnDate >= ACTIVE_DATASET.datasetStartDate).toBe(true);
        expect(r.returnDate <= ACTIVE_DATASET.asOfDate).toBe(true);
        expect(r.processedDate >= ACTIVE_DATASET.datasetStartDate).toBe(true);
        expect(r.processedDate <= ACTIVE_DATASET.asOfDate).toBe(true);
      });
    });

    it('generateReturnDates produces valid dates with processing delay', () => {
      const random = new DeterministicRandom(42);
      const { returnDate, processedDate } = generateReturnDates(random, '2024-06-15');
      expect(returnDate >= '2024-06-15').toBe(true);
      expect(returnDate <= ACTIVE_DATASET.asOfDate).toBe(true);
      expect(processedDate >= returnDate).toBe(true);
      expect(processedDate <= ACTIVE_DATASET.asOfDate).toBe(true);
    });
  });

  // ── Reasons ──────────────────────────────────────────────────────────────

  describe('reasons', () => {
    it('every reason is one of the four allowed values', () => {
      data.returns.forEach((r) => {
        expect(VALID_REASONS).toContain(r.reason);
      });
    });

    it('selectReason returns only valid reasons for non-AquaFlow products', () => {
      const random = new DeterministicRandom(123);
      for (let i = 0; i < 100; i++) {
        const reason = selectReason(random, '2024-01-01', 'Some Other Product');
        expect(VALID_REASONS).toContain(reason);
      }
    });
  });

  // ── Refunds ──────────────────────────────────────────────────────────────

  describe('refunds', () => {
    it('refund amount is non-negative for every return', () => {
      data.returns.forEach((r) => {
        expect(r.refundAmount).toBeGreaterThanOrEqual(0);
      });
    });

    it('refund amount equals unit_price_at_purchase × quantity', () => {
      data.returns.forEach((r) => {
        const item = orderItemMap.get(r.orderItemId)!;
        const expectedCents = Math.round(item.unitPriceAtPurchase * 100) * item.quantity;
        const expected = Number((expectedCents / 100).toFixed(2));
        expect(r.refundAmount).toBe(expected);
      });
    });

    it('refund uses purchase price, not current master product price', () => {
      const item = makeFixtureItem(999, 1, 1, 2, 106.00);
      expect(calculateRefundAmount(item)).toBe(212.00);
    });

    it('calculateRefundAmount handles cents correctly', () => {
      const item = makeFixtureItem(998, 1, 1, 3, 33.33);
      expect(calculateRefundAmount(item)).toBe(99.99);
    });
  });

  // ── Business behavior ─────────────────────────────────────────────────

  describe('business behavior', () => {
    it('category return rates are configured for all V1 categories', () => {
      expect(CATEGORY_RETURN_RATES['Apparel']).toBe(120);
      expect(CATEGORY_RETURN_RATES['Beauty & Personal Care']).toBe(80);
      expect(CATEGORY_RETURN_RATES['Kitchen & Dining']).toBe(50);
      expect(CATEGORY_RETURN_RATES['Home Goods']).toBe(60);
      expect(CATEGORY_RETURN_RATES['Electronics']).toBe(30);
      expect(CATEGORY_RETURN_RATES['Sporting Goods']).toBe(40);
    });

    it('getReturnRate returns category-specific rate for non-AquaFlow products', () => {
      expect(getReturnRate('Apparel', '2024-01-01', 'Luma Apparel 2')).toBe(120);
      expect(getReturnRate('Electronics', '2025-05-01', 'Mira Electronics 4')).toBe(30);
      expect(getReturnRate('Kitchen & Dining', '2025-07-14', 'Some Blender')).toBe(50);
    });

    it('getReturnRate returns normal K&D rate for non-AquaFlow K&D products even during event', () => {
      // Another Kitchen & Dining product during the AquaFlow event window
      expect(getReturnRate('Kitchen & Dining', '2025-07-15', 'Some Other Kitchen Product')).toBe(50);
      expect(getReturnRate('Kitchen & Dining', '2025-08-15', 'Fancy Mixer')).toBe(50);
      expect(getReturnRate('Kitchen & Dining', '2025-09-15', 'Toaster Pro')).toBe(50);
    });
  });

  // ── AquaFlow quality event ────────────────────────────────────────────

  describe('AquaFlow quality event', () => {
    it('AQUAFLOW_PRODUCT_NAME matches the product in reference data', () => {
      expect(aquaflowProduct).toBeDefined();
      expect(aquaflowProduct.productName).toBe(AQUAFLOW_PRODUCT_NAME);
      expect(aquaflowProduct.categoryId).toBe(kitchenCat.categoryId);
    });

    it('event window boundaries are exactly 2025-07-15 to 2025-09-15', () => {
      expect(AQUAFLOW_EVENT_START).toBe('2025-07-15');
      expect(AQUAFLOW_EVENT_END).toBe('2025-09-15');
    });

    it('getReturnRate returns elevated rate for AquaFlow Blender during event window', () => {
      expect(getReturnRate('Kitchen & Dining', '2025-07-15', AQUAFLOW_PRODUCT_NAME)).toBe(250);
      expect(getReturnRate('Kitchen & Dining', '2025-08-15', AQUAFLOW_PRODUCT_NAME)).toBe(250);
      expect(getReturnRate('Kitchen & Dining', '2025-09-15', AQUAFLOW_PRODUCT_NAME)).toBe(250);
    });

    it('getReturnRate returns normal K&D rate for AquaFlow Blender outside event window', () => {
      expect(getReturnRate('Kitchen & Dining', '2025-07-14', AQUAFLOW_PRODUCT_NAME)).toBe(50);
      expect(getReturnRate('Kitchen & Dining', '2025-09-16', AQUAFLOW_PRODUCT_NAME)).toBe(50);
      expect(getReturnRate('Kitchen & Dining', '2024-01-01', AQUAFLOW_PRODUCT_NAME)).toBe(50);
    });

    it('AquaFlow Blender returns during event are forced to defective reason', () => {
      const random = new DeterministicRandom(42);
      for (let i = 0; i < 50; i++) {
        const reason = selectReason(random, '2025-08-01', AQUAFLOW_PRODUCT_NAME);
        expect(reason).toBe('defective');
      }
    });

    it('AquaFlow Blender returns outside event use normal reason distribution', () => {
      const random = new DeterministicRandom(42);
      const reasons = new Set<ReturnReason>();
      for (let i = 0; i < 200; i++) {
        reasons.add(selectReason(random, '2025-01-01', AQUAFLOW_PRODUCT_NAME));
      }
      // With 200 draws, we expect at least 2 different reasons
      expect(reasons.size).toBeGreaterThan(1);
    });

    it('other Kitchen & Dining products use normal reason distribution during event', () => {
      const random = new DeterministicRandom(42);
      const reasons = new Set<ReturnReason>();
      for (let i = 0; i < 200; i++) {
        reasons.add(selectReason(random, '2025-08-01', 'Some Other Kitchen Product'));
      }
      // Normal distribution: should see multiple reasons, not forced defective
      expect(reasons.size).toBeGreaterThan(1);
    });

    it('AquaFlow event produces elevated return rate verified by large sample', () => {
      // Simulate 1000 AquaFlow Blender items during vs outside the event
      const duringRng = new DeterministicRandom(77);
      const outsideRng = new DeterministicRandom(77);

      let duringReturns = 0;
      let outsideReturns = 0;

      for (let i = 0; i < 1000; i++) {
        const duringRate = getReturnRate('Kitchen & Dining', '2025-08-01', AQUAFLOW_PRODUCT_NAME);
        if (shouldReturn(duringRng, duringRate)) duringReturns++;

        const outsideRate = getReturnRate('Kitchen & Dining', '2025-01-01', AQUAFLOW_PRODUCT_NAME);
        if (shouldReturn(outsideRng, outsideRate)) outsideReturns++;
      }

      // During event: ≈25 % should return → expect 150–350 (generous range for 1000 draws)
      expect(duringReturns).toBeGreaterThan(150);
      expect(duringReturns).toBeLessThan(350);

      // Outside event: ≈5 % should return → expect 20–100
      expect(outsideReturns).toBeGreaterThan(15);
      expect(outsideReturns).toBeLessThan(100);

      // During should be substantially higher than outside
      expect(duringReturns).toBeGreaterThan(outsideReturns * 2);
    });

    it('other K&D products retain normal return rate during the AquaFlow event window', () => {
      // Simulate 1000 non-AquaFlow Kitchen & Dining items during the event window
      const rng = new DeterministicRandom(77);
      let returns = 0;

      for (let i = 0; i < 1000; i++) {
        const rate = getReturnRate('Kitchen & Dining', '2025-08-01', 'Fancy Mixer');
        if (shouldReturn(rng, rate)) returns++;
      }

      // Normal K&D rate: ≈5 % → expect 20–100 (same range as AquaFlow outside event)
      expect(returns).toBeGreaterThan(15);
      expect(returns).toBeLessThan(100);
    });
  });

  // ── No database access ───────────────────────────────────────────────

  describe('no database access', () => {
    it('generateReturnData completes without a PostgreSQL connection', () => {
      expect(data.returns).toBeDefined();
      expect(Array.isArray(data.returns)).toBe(true);
    });
  });
});
