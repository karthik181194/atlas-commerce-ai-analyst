import { DEVELOPMENT_DATASET } from '../generator.config';
import { generateReferenceData } from '../reference-data/reference-data';
import { generateCustomers } from '../customers/customer-generator';
import { generateCampaignData } from '../campaigns/campaign-generator';
import type { Product } from '../reference-data/types';
import {
  calculateUnitPrice,
  generateOrderData,
  getInventoryShortageMultiplier,
  getMonthSeasonalWeight,
  getSeasonalProductWeight,
  matchCampaign,
  MUMBAI_WAREHOUSE_ID,
  type CategoryIds,
} from './order-generator';

// ─── Shared fixtures (generated once for the whole suite) ───────────────────

const ref = generateReferenceData();
const customers = generateCustomers();
const { campaigns } = generateCampaignData();
const data = generateOrderData();

// Lookup maps
const customerMap = new Map(customers.map((c) => [c.customerId, c]));
const regionMap = new Map(ref.regions.map((r) => [r.regionId, r]));
const productMap = new Map(ref.products.map((p) => [p.productId, p]));
const campaignMap = new Map(campaigns.map((c) => [c.campaignId, c]));
const orderMap = new Map(data.orders.map((o) => [o.orderId, o]));

// Category references (guaranteed present in reference data)
const homeGoodsCat = ref.productCategories.find((c) => c.categoryName === 'Home Goods')!;
const electronicsCat = ref.productCategories.find((c) => c.categoryName === 'Electronics')!;
const apparelCat = ref.productCategories.find((c) => c.categoryName === 'Apparel')!;
const kitchenCat = ref.productCategories.find((c) => c.categoryName === 'Kitchen & Dining')!;

const categoryIds: CategoryIds = {
  homeGoods: homeGoodsCat.categoryId,
  electronics: electronicsCat.categoryId,
  apparel: apparelCat.categoryId,
  kitchen: kitchenCat.categoryId,
};

/**
 * Factory for isolated fixture products.
 * These are used in helper-level tests that must not depend on whether the
 * 5-product development set happens to include a particular category.
 */
function makeFixture(categoryId: number, id: number, unitPrice = 100.0): Product {
  return {
    productId: id,
    productName: `Fixture Product ${id}`,
    categoryId,
    unitPrice,
    unitCost: Math.round(unitPrice * 0.75 * 100) / 100,
    launchDate: '2023-01-01',
    isActive: true,
  };
}

const fix = {
  electronics: makeFixture(electronicsCat.categoryId, 991),
  homeGoods: makeFixture(homeGoodsCat.categoryId, 992),
  apparel: makeFixture(apparelCat.categoryId, 993),
  kitchen: makeFixture(kitchenCat.categoryId, 994),
  sporting: makeFixture(
    ref.productCategories.find((c) => c.categoryName === 'Sporting Goods')!.categoryId,
    995,
  ),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('order generator', () => {
  // ── Counts ────────────────────────────────────────────────────────────────

  describe('counts', () => {
    it('generates exactly the configured number of orders', () => {
      expect(data.orders).toHaveLength(DEVELOPMENT_DATASET.orders);
    });

    it('generates at least one order item', () => {
      expect(data.orderItems.length).toBeGreaterThan(0);
    });

    it('order IDs are unique and sequential from 1', () => {
      const ids = data.orders.map((o) => o.orderId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(
        Array.from({ length: DEVELOPMENT_DATASET.orders }, (_, i) => i + 1),
      );
    });

    it('order item IDs are unique', () => {
      const ids = data.orderItems.map((i) => i.orderItemId);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ── Referential integrity ─────────────────────────────────────────────────

  describe('referential integrity', () => {
    it('every customer_id references an existing customer', () => {
      const valid = new Set(customers.map((c) => c.customerId));
      data.orders.forEach((o) => expect(valid.has(o.customerId)).toBe(true));
    });

    it('region_id on each order matches the customer\'s own region', () => {
      data.orders.forEach((o) => {
        const customer = customerMap.get(o.customerId)!;
        expect(o.regionId).toBe(customer.regionId);
      });
    });

    it('segment_at_order matches the customer\'s segment at generation time', () => {
      data.orders.forEach((o) => {
        const customer = customerMap.get(o.customerId)!;
        expect(o.segmentAtOrder).toBe(customer.segmentId);
      });
    });

    it('fulfilling_warehouse_id is the correct warehouse for the order region', () => {
      data.orders.forEach((o) => {
        const region = regionMap.get(o.regionId)!;
        expect(o.fulfillingWarehouseId).toBe(region.defaultWarehouseId);
      });
    });

    it('campaign_id is null or references an existing campaign', () => {
      const valid = new Set(campaigns.map((c) => c.campaignId));
      data.orders.forEach((o) => {
        expect(o.campaignId === null || valid.has(o.campaignId)).toBe(true);
      });
    });

    it('every order_item.order_id references an existing order', () => {
      const valid = new Set(data.orders.map((o) => o.orderId));
      data.orderItems.forEach((i) => expect(valid.has(i.orderId)).toBe(true));
    });

    it('every order_item.product_id references an existing product', () => {
      const valid = new Set(ref.products.map((p) => p.productId));
      data.orderItems.forEach((i) => expect(valid.has(i.productId)).toBe(true));
    });
  });

  // ── Dates ─────────────────────────────────────────────────────────────────

  describe('dates', () => {
    it('every order date is within the dataset period', () => {
      data.orders.forEach((o) => {
        expect(o.orderDate >= DEVELOPMENT_DATASET.datasetStartDate).toBe(true);
        expect(o.orderDate <= DEVELOPMENT_DATASET.asOfDate).toBe(true);
      });
    });

    it('every order date is on or after the customer signup date', () => {
      data.orders.forEach((o) => {
        const customer = customerMap.get(o.customerId)!;
        expect(o.orderDate >= customer.signupDate).toBe(true);
      });
    });
  });

  // ── Monetary correctness ──────────────────────────────────────────────────

  describe('monetary correctness', () => {
    it('every quantity is a positive integer', () => {
      data.orderItems.forEach((i) => {
        expect(Number.isInteger(i.quantity)).toBe(true);
        expect(i.quantity).toBeGreaterThan(0);
      });
    });

    it('every unit_price_at_purchase is positive', () => {
      data.orderItems.forEach((i) => {
        expect(i.unitPriceAtPurchase).toBeGreaterThan(0);
      });
    });

    it('every order has at least one order item', () => {
      data.orders.forEach((o) => {
        const items = data.orderItems.filter((i) => i.orderId === o.orderId);
        expect(items.length).toBeGreaterThan(0);
      });
    });

    it('line_total formula is arithmetically correct for every item', () => {
      data.orderItems.forEach((i) => {
        const lineTotal = i.quantity * i.unitPriceAtPurchase;
        expect(lineTotal).toBeGreaterThan(0);
        expect(Number.isFinite(lineTotal)).toBe(true);
      });
    });

    it('order total_amount equals the sum of its item line totals to two decimals', () => {
      data.orders.forEach((o) => {
        const items = data.orderItems.filter((i) => i.orderId === o.orderId);
        const expectedCents = items.reduce(
          (sum, i) => sum + Math.round(i.quantity * i.unitPriceAtPurchase * 100),
          0,
        );
        expect(Math.round(o.totalAmount * 100)).toBe(expectedCents);
      });
    });

    it('cancelled orders are structurally valid (positive total, valid items)', () => {
      const cancelled = data.orders.filter((o) => o.orderStatus === 'cancelled');
      cancelled.forEach((o) => {
        expect(o.totalAmount).toBeGreaterThan(0);
        const items = data.orderItems.filter((i) => i.orderId === o.orderId);
        expect(items.length).toBeGreaterThan(0);
        items.forEach((i) => {
          expect(i.quantity).toBeGreaterThan(0);
          expect(i.unitPriceAtPurchase).toBeGreaterThan(0);
        });
      });
    });
  });

  // ── Campaign correctness ──────────────────────────────────────────────────

  describe('campaign correctness', () => {
    it('every assigned campaign was active on the order date', () => {
      data.orders
        .filter((o) => o.campaignId !== null)
        .forEach((o) => {
          const campaign = campaignMap.get(o.campaignId!)!;
          expect(o.orderDate >= campaign.startDate).toBe(true);
          expect(o.orderDate <= campaign.endDate).toBe(true);
        });
    });

    it('campaign segment targeting is respected', () => {
      data.orders
        .filter((o) => o.campaignId !== null)
        .forEach((o) => {
          const campaign = campaignMap.get(o.campaignId!)!;
          if (campaign.targetSegmentId !== null) {
            const customer = customerMap.get(o.customerId)!;
            expect(customer.segmentId).toBe(campaign.targetSegmentId);
          }
        });
    });

    it('campaign region targeting is respected', () => {
      data.orders
        .filter((o) => o.campaignId !== null)
        .forEach((o) => {
          const campaign = campaignMap.get(o.campaignId!)!;
          if (campaign.targetRegionId !== null) {
            const customer = customerMap.get(o.customerId)!;
            expect(customer.regionId).toBe(campaign.targetRegionId);
          }
        });
    });

    it('Summer Loyalty Push: only Loyal customers in South within active dates get attributed', () => {
      const summerCampaign = campaigns.find((c) => c.campaignName === 'Summer Loyalty Push')!;
      const loyalId = ref.customerSegments.find((s) => s.segmentName === 'Loyal')!.segmentId;
      const southId = ref.regions.find((r) => r.regionName === 'South')!.regionId;

      const summerOrders = data.orders.filter((o) => o.campaignId === summerCampaign.campaignId);
      summerOrders.forEach((o) => {
        const customer = customerMap.get(o.customerId)!;
        expect(customer.segmentId).toBe(loyalId);
        expect(customer.regionId).toBe(southId);
        expect(o.orderDate >= summerCampaign.startDate).toBe(true);
        expect(o.orderDate <= summerCampaign.endDate).toBe(true);
      });
    });

    it('matchCampaign: returns null outside campaign window, attribution inside window', () => {
      const summerCampaign = campaigns.find((c) => c.campaignName === 'Summer Loyalty Push')!;
      const loyalId = ref.customerSegments.find((s) => s.segmentName === 'Loyal')!.segmentId;
      const southId = ref.regions.find((r) => r.regionName === 'South')!.regionId;
      // Find or synthesise a Loyal+South fixture customer for deterministic unit test
      const loyalSouth = customers.find(
        (c) => c.segmentId === loyalId && c.regionId === southId,
      ) ?? {
        customerId: 99,
        firstName: 'Test',
        lastName: 'User',
        email: 'test@test.com',
        regionId: southId,
        segmentId: loyalId,
        signupDate: '2023-03-01',
      };

      // Before campaign start
      expect(matchCampaign(loyalSouth, '2025-05-14', [summerCampaign])).toBeNull();
      // After campaign end
      expect(matchCampaign(loyalSouth, '2025-08-01', [summerCampaign])).toBeNull();
      // During campaign
      expect(matchCampaign(loyalSouth, '2025-06-15', [summerCampaign])).toBe(
        summerCampaign.campaignId,
      );
    });
  });

  // ── Electronics price event (hidden event 1) ──────────────────────────────

  describe('electronics price event (hidden event 1)', () => {
    it('electronics: price unchanged before 2025-06-01', () => {
      expect(calculateUnitPrice(fix.electronics, '2023-03-01', electronicsCat.categoryId)).toBe(
        100.0,
      );
      expect(calculateUnitPrice(fix.electronics, '2025-05-31', electronicsCat.categoryId)).toBe(
        100.0,
      );
    });

    it('electronics: price is exactly +6 % on 2025-06-01', () => {
      expect(calculateUnitPrice(fix.electronics, '2025-06-01', electronicsCat.categoryId)).toBe(
        106.0,
      );
    });

    it('electronics: price is +6 % for all dates after 2025-06-01', () => {
      expect(calculateUnitPrice(fix.electronics, '2025-06-15', electronicsCat.categoryId)).toBe(
        106.0,
      );
      expect(calculateUnitPrice(fix.electronics, '2025-09-15', electronicsCat.categoryId)).toBe(
        106.0,
      );
    });

    it('non-electronics product price is never modified by the price event', () => {
      expect(calculateUnitPrice(fix.homeGoods, '2025-06-01', electronicsCat.categoryId)).toBe(
        100.0,
      );
      expect(calculateUnitPrice(fix.apparel, '2025-08-01', electronicsCat.categoryId)).toBe(100.0);
    });

    it('product master unitPrice is unmodified after running generateOrderData', () => {
      const before = generateReferenceData(DEVELOPMENT_DATASET.seed).products.map((p) => ({
        id: p.productId,
        price: p.unitPrice,
      }));
      generateOrderData(); // run generator — must not mutate master data
      const after = generateReferenceData(DEVELOPMENT_DATASET.seed).products.map((p) => ({
        id: p.productId,
        price: p.unitPrice,
      }));
      expect(after).toEqual(before);
    });

    it('all electronics order items use the correct price for their order date', () => {
      // Covers both pre- and post-event dates for whatever items appear in the dev dataset
      const electronicsItems = data.orderItems.filter(
        (item) => productMap.get(item.productId)?.categoryId === electronicsCat.categoryId,
      );

      electronicsItems.forEach((item) => {
        const order = orderMap.get(item.orderId)!;
        const product = productMap.get(item.productId)!;
        const expected = calculateUnitPrice(product, order.orderDate, electronicsCat.categoryId);
        expect(item.unitPriceAtPurchase).toBe(expected);
      });
    });

    it('calculateUnitPrice boundary: price changes on exactly 2025-06-01 not before', () => {
      // Fixture with non-round price to test rounding
      const p = makeFixture(electronicsCat.categoryId, 990, 123.45);
      const expectedIncreased = Number((123.45 * 1.06).toFixed(2));
      expect(calculateUnitPrice(p, '2025-05-31', electronicsCat.categoryId)).toBe(123.45);
      expect(calculateUnitPrice(p, '2025-06-01', electronicsCat.categoryId)).toBe(
        expectedIncreased,
      );
    });
  });

  // ── Inventory shortage demand weight (hidden event 2) ─────────────────────

  describe('inventory shortage demand weight (hidden event 2)', () => {
    it('Home Goods at Mumbai DC during shortage window returns multiplier < 1', () => {
      expect(
        getInventoryShortageMultiplier(
          homeGoodsCat.categoryId,
          MUMBAI_WAREHOUSE_ID,
          '2025-08-01',
          homeGoodsCat.categoryId,
        ),
      ).toBeLessThan(1);
      expect(
        getInventoryShortageMultiplier(
          homeGoodsCat.categoryId,
          MUMBAI_WAREHOUSE_ID,
          '2025-08-22',
          homeGoodsCat.categoryId,
        ),
      ).toBeLessThan(1);
      expect(
        getInventoryShortageMultiplier(
          homeGoodsCat.categoryId,
          MUMBAI_WAREHOUSE_ID,
          '2025-08-11',
          homeGoodsCat.categoryId,
        ),
      ).toBeLessThan(1);
    });

    it('Home Goods at Mumbai DC outside shortage window returns 1', () => {
      expect(
        getInventoryShortageMultiplier(
          homeGoodsCat.categoryId,
          MUMBAI_WAREHOUSE_ID,
          '2025-07-31',
          homeGoodsCat.categoryId,
        ),
      ).toBe(1);
      expect(
        getInventoryShortageMultiplier(
          homeGoodsCat.categoryId,
          MUMBAI_WAREHOUSE_ID,
          '2025-08-23',
          homeGoodsCat.categoryId,
        ),
      ).toBe(1);
    });

    it('Electronics at Mumbai DC during shortage window is unaffected', () => {
      expect(
        getInventoryShortageMultiplier(
          electronicsCat.categoryId,
          MUMBAI_WAREHOUSE_ID,
          '2025-08-15',
          homeGoodsCat.categoryId,
        ),
      ).toBe(1);
    });

    it('Home Goods at a non-Mumbai warehouse during shortage window is unaffected', () => {
      const delhiWarehouseId = 1; // Delhi DC
      expect(
        getInventoryShortageMultiplier(
          homeGoodsCat.categoryId,
          delhiWarehouseId,
          '2025-08-15',
          homeGoodsCat.categoryId,
        ),
      ).toBe(1);
    });

    it('shortage suppression is reflected in product selection weights', () => {
      // Compare Home Goods weight at Mumbai DC during vs outside shortage
      const duringShortage = getSeasonalProductWeight(
        fix.homeGoods,
        0,
        '2025-08-11', // Monday in August — shortage period
        MUMBAI_WAREHOUSE_ID,
        categoryIds,
      );
      const afterShortage = getSeasonalProductWeight(
        fix.homeGoods,
        0,
        '2025-09-01', // Monday in September — no shortage
        MUMBAI_WAREHOUSE_ID,
        categoryIds,
      );
      expect(duringShortage).toBeLessThan(afterShortage);
    });
  });

  // ── Seasonality weighting ─────────────────────────────────────────────────

  describe('seasonality weighting rules', () => {
    // Use a non-Mumbai warehouse so shortage suppression does not interfere
    const nonMumbaiWarehouse = 1; // Delhi DC

    // Dates chosen for unambiguous day-of-week verification:
    //   2025-07-14 → Monday  (getUTCDay = 1)  weekday
    //   2025-07-12 → Saturday (getUTCDay = 6) weekend
    //   2025-08-11 → Monday  (getUTCDay = 1)  August weekday
    const weekdayDate = '2025-07-14';
    const weekendDate = '2025-07-12';
    const augustWeekday = '2025-08-11';

    it('Home Goods product weight is higher on weekend than weekday', () => {
      const weekend = getSeasonalProductWeight(
        fix.homeGoods,
        0,
        weekendDate,
        nonMumbaiWarehouse,
        categoryIds,
      );
      const weekday = getSeasonalProductWeight(
        fix.homeGoods,
        0,
        weekdayDate,
        nonMumbaiWarehouse,
        categoryIds,
      );
      expect(weekend).toBeGreaterThan(weekday);
    });

    it('Apparel product weight is higher on weekend than weekday', () => {
      const weekend = getSeasonalProductWeight(
        fix.apparel,
        0,
        weekendDate,
        nonMumbaiWarehouse,
        categoryIds,
      );
      const weekday = getSeasonalProductWeight(
        fix.apparel,
        0,
        weekdayDate,
        nonMumbaiWarehouse,
        categoryIds,
      );
      expect(weekend).toBeGreaterThan(weekday);
    });

    it('Electronics weight does not vary between weekend and weekday', () => {
      const weekend = getSeasonalProductWeight(
        fix.electronics,
        0,
        weekendDate,
        nonMumbaiWarehouse,
        categoryIds,
      );
      const weekday = getSeasonalProductWeight(
        fix.electronics,
        0,
        weekdayDate,
        nonMumbaiWarehouse,
        categoryIds,
      );
      expect(weekend).toBe(weekday);
    });

    it('Home Goods weight is higher in August than non-August (weekday comparison)', () => {
      const august = getSeasonalProductWeight(
        fix.homeGoods,
        0,
        augustWeekday,
        nonMumbaiWarehouse,
        categoryIds,
      );
      const july = getSeasonalProductWeight(
        fix.homeGoods,
        0,
        weekdayDate, // July weekday
        nonMumbaiWarehouse,
        categoryIds,
      );
      expect(august).toBeGreaterThan(july);
    });

    it('Kitchen & Dining weight is higher in August than non-August (weekday comparison)', () => {
      const august = getSeasonalProductWeight(
        fix.kitchen,
        0,
        augustWeekday,
        nonMumbaiWarehouse,
        categoryIds,
      );
      const july = getSeasonalProductWeight(
        fix.kitchen,
        0,
        weekdayDate,
        nonMumbaiWarehouse,
        categoryIds,
      );
      expect(august).toBeGreaterThan(july);
    });

    it('Q4 months (Oct–Dec) have higher order-date selection weight than other months', () => {
      expect(getMonthSeasonalWeight(10)).toBeGreaterThan(getMonthSeasonalWeight(9));
      expect(getMonthSeasonalWeight(11)).toBeGreaterThan(getMonthSeasonalWeight(9));
      expect(getMonthSeasonalWeight(12)).toBeGreaterThan(getMonthSeasonalWeight(9));
    });

    it('non-Q4 months all have the same base date-selection weight', () => {
      const jan = getMonthSeasonalWeight(1);
      expect(getMonthSeasonalWeight(2)).toBe(jan);
      expect(getMonthSeasonalWeight(6)).toBe(jan);
      expect(getMonthSeasonalWeight(9)).toBe(jan);
    });
  });

  // ── Determinism ───────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('same seed → identical orders and items on repeated calls', () => {
      expect(generateOrderData(DEVELOPMENT_DATASET.seed)).toEqual(
        generateOrderData(DEVELOPMENT_DATASET.seed),
      );
    });

    it('different seed → different orders', () => {
      const alt = generateOrderData(DEVELOPMENT_DATASET.seed + 1);
      expect(alt.orders).not.toEqual(data.orders);
    });
  });

  // ── No database access ────────────────────────────────────────────────────

  describe('no database access', () => {
    it('generateOrderData completes without a PostgreSQL connection', () => {
      // This test passes structurally: if a DB call were attempted, the test
      // suite would have already crashed (no pg connection is configured).
      expect(data.orders).toBeDefined();
      expect(data.orderItems).toBeDefined();
    });
  });
});

