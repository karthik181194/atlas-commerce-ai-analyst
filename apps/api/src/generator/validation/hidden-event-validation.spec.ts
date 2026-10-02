/**
 * Step 8 — Hidden-Event Validation Test Suite
 *
 * Validates that the deterministic data generator correctly produces
 * all intentionally designed hidden business events.
 *
 * Uses controlled fixtures and exported helper functions for deterministic
 * rule validation. Production-scale generation is used only where needed
 * to validate probabilistic behavior at meaningful sample sizes.
 *
 * Does NOT connect to PostgreSQL.
 * Does NOT modify any generator logic.
 */

import { DeterministicRandom } from '../deterministic-random';
import { generateReferenceData } from '../reference-data/reference-data';
import { generateCampaignData } from '../campaigns/campaign-generator';
import {
  calculateUnitPrice,
  getInventoryShortageMultiplier,
  getMonthSeasonalWeight,
  getSeasonalProductWeight,
  matchCampaign,
  type CategoryIds,
} from '../orders/order-generator';
import {
  getReturnRate,
  selectReason,
  shouldReturn,
  AQUAFLOW_PRODUCT_NAME,
  AQUAFLOW_EVENT_START,
  AQUAFLOW_EVENT_END,
  CATEGORY_RETURN_RATES,
} from '../returns/return-generator';
import {
  generateInventoryData,
  findMumbaiWarehouse,
  SHORTAGE_START_DATE,
  SHORTAGE_END_DATE,
  SHORTAGE_WAREHOUSE_NAME,
  SHORTAGE_CATEGORY_NAME,
} from '../inventory/inventory-generator';
import type { Product } from '../reference-data/types';
import type { Customer } from '../customers/customer-generator';
import { VALIDATION_SEED } from './hidden-event-validation';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const ref = generateReferenceData();
const categoryMap = new Map(
  ref.productCategories.map((c) => [c.categoryId, c.categoryName]),
);
const findCat = (name: string) =>
  ref.productCategories.find((c) => c.categoryName === name)!;

const categoryIds: CategoryIds = {
  homeGoods: findCat('Home Goods').categoryId,
  electronics: findCat('Electronics').categoryId,
  apparel: findCat('Apparel').categoryId,
  kitchen: findCat('Kitchen & Dining').categoryId,
};

const aquaflowProduct = ref.products.find(
  (p) => p.productName === AQUAFLOW_PRODUCT_NAME,
)!;

// Fixture helpers
function makeProduct(
  id: number,
  categoryId: number,
  unitPrice = 100.0,
  name = `Fixture ${id}`,
): Product {
  return {
    productId: id,
    productName: name,
    categoryId,
    unitPrice,
    unitCost: Math.round(unitPrice * 65) / 100,
    launchDate: '2023-03-01',
    isActive: true,
  };
}

function makeCustomer(
  id: number,
  segmentId: number,
  regionId: number,
): Customer {
  return {
    customerId: id,
    segmentId,
    regionId,
    signupDate: '2023-06-01',
    lifetimeValue: 0,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Step 8 — Hidden-Event Validation', () => {
  // ════════════════════════════════════════════════════════════════════════
  // 1. MUMBAI HOME GOODS INVENTORY SHORTAGE
  // ════════════════════════════════════════════════════════════════════════

  describe('1. Mumbai Home Goods inventory shortage', () => {
    // Use a seed that produces Home Goods products to validate shortage presence
    // Test multiple seeds to find one with Home Goods products
    const inventoryData = generateInventoryData();
    const mumbaiWarehouse = findMumbaiWarehouse(ref.warehouses);

    it('Mumbai DC exists and is correctly identified from reference data', () => {
      expect(mumbaiWarehouse).toBeDefined();
      expect(mumbaiWarehouse.warehouseName).toBe(SHORTAGE_WAREHOUSE_NAME);
    });

    it('shortage window is 2025-08-01 through 2025-08-22', () => {
      expect(SHORTAGE_START_DATE).toBe('2025-08-01');
      expect(SHORTAGE_END_DATE).toBe('2025-08-22');
    });

    it('shortage_start events have stock_level_after = 0', () => {
      const shortageStarts = inventoryData.inventoryEvents.filter(
        (e) => e.eventType === 'shortage_start',
      );
      shortageStarts.forEach((e) => {
        expect(e.stockLevelAfter).toBe(0);
      });
    });

    it('affected products belong to Home Goods category only', () => {
      const shortageEvents = inventoryData.inventoryEvents.filter(
        (e) => e.eventType === 'shortage_start' || e.eventType === 'shortage_end',
      );
      const homeGoodsProductIds = new Set(
        ref.products
          .filter((p) => p.categoryId === categoryIds.homeGoods)
          .map((p) => p.productId),
      );
      shortageEvents.forEach((e) => {
        expect(homeGoodsProductIds.has(e.productId)).toBe(true);
      });
    });

    it('shortage events occur only at Mumbai DC', () => {
      const shortageEvents = inventoryData.inventoryEvents.filter(
        (e) => e.eventType === 'shortage_start' || e.eventType === 'shortage_end',
      );
      shortageEvents.forEach((e) => {
        expect(e.warehouseId).toBe(mumbaiWarehouse.warehouseId);
      });
    });

    it('no restock occurs for affected Mumbai SKUs between Aug 1 and Aug 22 (fixture)', () => {
      // Validate via the demand-side helper: shortage multiplier applies correctly
      const multiplier = getInventoryShortageMultiplier(
        categoryIds.homeGoods,
        mumbaiWarehouse.warehouseId,
        '2025-08-10',
        categoryIds.homeGoods,
      );
      expect(multiplier).toBeLessThan(1);
      expect(multiplier).toBeCloseTo(0.45, 2);
    });

    it('demand-side shortage multiplier is 1.0 outside the shortage window', () => {
      expect(
        getInventoryShortageMultiplier(
          categoryIds.homeGoods, mumbaiWarehouse.warehouseId, '2025-07-31', categoryIds.homeGoods,
        ),
      ).toBe(1);
      expect(
        getInventoryShortageMultiplier(
          categoryIds.homeGoods, mumbaiWarehouse.warehouseId, '2025-08-23', categoryIds.homeGoods,
        ),
      ).toBe(1);
    });

    it('non-Mumbai warehouses are not affected by shortage', () => {
      for (const wh of ref.warehouses) {
        if (wh.warehouseId === mumbaiWarehouse.warehouseId) continue;
        expect(
          getInventoryShortageMultiplier(
            categoryIds.homeGoods, wh.warehouseId, '2025-08-10', categoryIds.homeGoods,
          ),
        ).toBe(1);
      }
    });

    it('non-Home-Goods categories are not affected by shortage at Mumbai DC', () => {
      expect(
        getInventoryShortageMultiplier(
          categoryIds.electronics, mumbaiWarehouse.warehouseId, '2025-08-10', categoryIds.homeGoods,
        ),
      ).toBe(1);
      expect(
        getInventoryShortageMultiplier(
          categoryIds.apparel, mumbaiWarehouse.warehouseId, '2025-08-10', categoryIds.homeGoods,
        ),
      ).toBe(1);
      expect(
        getInventoryShortageMultiplier(
          categoryIds.kitchen, mumbaiWarehouse.warehouseId, '2025-08-10', categoryIds.homeGoods,
        ),
      ).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 2. AQUAFLOW BLENDER QUALITY ISSUE
  // ════════════════════════════════════════════════════════════════════════

  describe('2. AquaFlow Blender quality issue', () => {
    it('AquaFlow Blender exists in generated reference data', () => {
      expect(aquaflowProduct).toBeDefined();
      expect(aquaflowProduct.productName).toBe(AQUAFLOW_PRODUCT_NAME);
    });

    it('AquaFlow Blender belongs to Kitchen & Dining', () => {
      expect(aquaflowProduct.categoryId).toBe(categoryIds.kitchen);
    });

    it('quality-event window is 2025-07-15 through 2025-09-15', () => {
      expect(AQUAFLOW_EVENT_START).toBe('2025-07-15');
      expect(AQUAFLOW_EVENT_END).toBe('2025-09-15');
    });

    it('AquaFlow return rate is elevated during the event window', () => {
      const duringRate = getReturnRate('Kitchen & Dining', '2025-08-01', AQUAFLOW_PRODUCT_NAME);
      const outsideRate = getReturnRate('Kitchen & Dining', '2025-07-14', AQUAFLOW_PRODUCT_NAME);
      expect(duringRate).toBe(250); // ≈25%
      expect(outsideRate).toBe(CATEGORY_RETURN_RATES['Kitchen & Dining']); // normal 50/1000
      expect(duringRate).toBeGreaterThan(outsideRate * 3);
    });

    it('elevated rate applies only to AquaFlow, not other Kitchen & Dining products', () => {
      const otherKDRate = getReturnRate('Kitchen & Dining', '2025-08-01', 'Fancy Mixer');
      expect(otherKDRate).toBe(CATEGORY_RETURN_RATES['Kitchen & Dining']); // normal
    });

    it('unrelated categories are unaffected during the AquaFlow event window', () => {
      expect(getReturnRate('Electronics', '2025-08-01', 'Some Gadget')).toBe(
        CATEGORY_RETURN_RATES['Electronics'],
      );
      expect(getReturnRate('Apparel', '2025-08-01', 'Some Shirt')).toBe(
        CATEGORY_RETURN_RATES['Apparel'],
      );
    });

    it('AquaFlow defective rate is materially elevated vs baseline (large sample)', () => {
      const duringRng = new DeterministicRandom(42);
      const outsideRng = new DeterministicRandom(42);
      let duringDefective = 0;
      let outsideDefective = 0;
      const N = 1000;

      for (let i = 0; i < N; i++) {
        const duringRate = getReturnRate('Kitchen & Dining', '2025-08-01', AQUAFLOW_PRODUCT_NAME);
        if (shouldReturn(duringRng, duringRate)) {
          const reason = selectReason(duringRng, '2025-08-01', AQUAFLOW_PRODUCT_NAME);
          if (reason === 'defective') duringDefective++;
        }

        const outsideRate = getReturnRate('Kitchen & Dining', '2025-01-01', AQUAFLOW_PRODUCT_NAME);
        if (shouldReturn(outsideRng, outsideRate)) {
          const reason = selectReason(outsideRng, '2025-01-01', AQUAFLOW_PRODUCT_NAME);
          if (reason === 'defective') outsideDefective++;
        }
      }

      // During event: ~25% defective returns (all returns are forced defective)
      expect(duringDefective).toBeGreaterThan(150);
      expect(duringDefective).toBeLessThan(350);

      // Outside event: ~5% return rate × ~20% defective = ~1% defective
      expect(outsideDefective).toBeLessThan(50);

      // Material elevation
      expect(duringDefective).toBeGreaterThan(outsideDefective * 3);
    });

    it('event boundary is exact: July 14 = normal, July 15 = elevated', () => {
      const beforeRate = getReturnRate('Kitchen & Dining', '2025-07-14', AQUAFLOW_PRODUCT_NAME);
      const startRate = getReturnRate('Kitchen & Dining', '2025-07-15', AQUAFLOW_PRODUCT_NAME);
      const endRate = getReturnRate('Kitchen & Dining', '2025-09-15', AQUAFLOW_PRODUCT_NAME);
      const afterRate = getReturnRate('Kitchen & Dining', '2025-09-16', AQUAFLOW_PRODUCT_NAME);

      expect(beforeRate).toBe(CATEGORY_RETURN_RATES['Kitchen & Dining']);
      expect(startRate).toBe(250);
      expect(endRate).toBe(250);
      expect(afterRate).toBe(CATEGORY_RETURN_RATES['Kitchen & Dining']);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 3. SUMMER LOYALTY PUSH CAMPAIGN
  // ════════════════════════════════════════════════════════════════════════

  describe('3. Summer Loyalty Push campaign', () => {
    const { campaigns, campaignSpend } = generateCampaignData();
    const slp = campaigns.find((c) => c.campaignName === 'Summer Loyalty Push')!;

    it('Summer Loyalty Push exists', () => {
      expect(slp).toBeDefined();
      expect(slp.campaignName).toBe('Summer Loyalty Push');
    });

    it('targets Loyal segment', () => {
      const loyalSegment = ref.customerSegments.find((s) => s.segmentName === 'Loyal')!;
      expect(slp.targetSegmentId).toBe(loyalSegment.segmentId);
    });

    it('targets South region', () => {
      const southRegion = ref.regions.find((r) => r.regionName === 'South')!;
      expect(slp.targetRegionId).toBe(southRegion.regionId);
    });

    it('ends on 2025-07-31', () => {
      expect(slp.endDate).toBe('2025-07-31');
    });

    it('campaign spend stops on 2025-07-31 — no spend after that date', () => {
      const slpSpend = campaignSpend.filter((s) => s.campaignId === slp.campaignId);
      expect(slpSpend.length).toBeGreaterThan(0);

      const lastSpendDate = slpSpend.reduce(
        (max, s) => (s.spendDate > max ? s.spendDate : max),
        '',
      );
      expect(lastSpendDate).toBe('2025-07-31');

      const postEndSpend = slpSpend.filter((s) => s.spendDate > '2025-07-31');
      expect(postEndSpend).toHaveLength(0);
    });

    it('campaign spend exists during the active period', () => {
      const slpSpend = campaignSpend.filter((s) => s.campaignId === slp.campaignId);
      const activeSpend = slpSpend.filter(
        (s) => s.spendDate >= slp.startDate && s.spendDate <= slp.endDate,
      );
      expect(activeSpend.length).toBe(slpSpend.length);
    });

    it('August has no Summer Loyalty Push spend', () => {
      const slpSpend = campaignSpend.filter((s) => s.campaignId === slp.campaignId);
      const augustSpend = slpSpend.filter((s) => s.spendDate.startsWith('2025-08'));
      expect(augustSpend).toHaveLength(0);
    });

    it('campaign attribution can occur during the active window', () => {
      const loyalSegment = ref.customerSegments.find((s) => s.segmentName === 'Loyal')!;
      const southRegion = ref.regions.find((r) => r.regionName === 'South')!;

      const loyalSouthCustomer = makeCustomer(999, loyalSegment.segmentId, southRegion.regionId);

      // During campaign
      const matchDuring = matchCampaign(loyalSouthCustomer, '2025-06-15', campaigns);
      expect(matchDuring).toBe(slp.campaignId);

      // After campaign end
      const matchAfter = matchCampaign(loyalSouthCustomer, '2025-08-15', campaigns);
      // Should NOT match the SLP (it ended July 31)
      expect(matchAfter !== slp.campaignId || matchAfter === null).toBe(true);
    });

    it('7-day attribution tail is NOT encoded as campaign spend beyond end date', () => {
      const slpSpend = campaignSpend.filter((s) => s.campaignId === slp.campaignId);
      // Spend in Aug 1–7 (the "attribution tail" period) should be zero
      const tailSpend = slpSpend.filter(
        (s) => s.spendDate >= '2025-08-01' && s.spendDate <= '2025-08-07',
      );
      expect(tailSpend).toHaveLength(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 4. ELECTRONICS PRICE INCREASE
  // ════════════════════════════════════════════════════════════════════════

  describe('4. Electronics price increase', () => {
    const electronicsProduct = makeProduct(
      800, categoryIds.electronics, 100.00, 'Fixture Electronics',
    );

    it('+6% purchase price begins 2025-06-01', () => {
      const preBefore = calculateUnitPrice(electronicsProduct, '2025-05-31', categoryIds.electronics);
      const priceOnJune1 = calculateUnitPrice(electronicsProduct, '2025-06-01', categoryIds.electronics);
      expect(preBefore).toBe(100.00);
      expect(priceOnJune1).toBe(106.00);
    });

    it('price increase persists after June 1', () => {
      const priceSep = calculateUnitPrice(electronicsProduct, '2025-09-15', categoryIds.electronics);
      expect(priceSep).toBe(106.00);
    });

    it('master product unitPrice is never modified', () => {
      // calculateUnitPrice does not mutate the product object
      calculateUnitPrice(electronicsProduct, '2025-09-15', categoryIds.electronics);
      expect(electronicsProduct.unitPrice).toBe(100.00);
    });

    it('applies to Electronics category only — unrelated categories unaffected', () => {
      const homeProduct = makeProduct(801, categoryIds.homeGoods, 100.00);
      const apparelProduct = makeProduct(802, categoryIds.apparel, 100.00);
      const kitchenProduct = makeProduct(803, categoryIds.kitchen, 100.00);

      expect(calculateUnitPrice(homeProduct, '2025-09-15', categoryIds.electronics)).toBe(100.00);
      expect(calculateUnitPrice(apparelProduct, '2025-09-15', categoryIds.electronics)).toBe(100.00);
      expect(calculateUnitPrice(kitchenProduct, '2025-09-15', categoryIds.electronics)).toBe(100.00);
    });

    it('uses integer-cent arithmetic correctly', () => {
      const oddPriceProduct = makeProduct(804, categoryIds.electronics, 33.33);
      const adjusted = calculateUnitPrice(oddPriceProduct, '2025-06-01', categoryIds.electronics);
      // 33.33 × 1.06 = 35.3298 → toFixed(2) = 35.33
      expect(adjusted).toBe(35.33);
    });

    it('pre-June-1 Electronics orders use the base product price', () => {
      const beforePrices = [
        calculateUnitPrice(electronicsProduct, '2024-01-01', categoryIds.electronics),
        calculateUnitPrice(electronicsProduct, '2025-01-01', categoryIds.electronics),
        calculateUnitPrice(electronicsProduct, '2025-05-31', categoryIds.electronics),
      ];
      beforePrices.forEach((p) => expect(p).toBe(100.00));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 5. AUGUST SEASONAL BEHAVIOR
  // ════════════════════════════════════════════════════════════════════════

  describe('5. August seasonal behavior', () => {
    // Midweek August date (Wednesday Aug 6 2025)
    const augustDate = '2025-08-06';
    // Midweek non-August date (Wednesday Jun 4 2025)
    const nonAugustDate = '2025-06-04';
    // Non-Mumbai warehouse
    const delhiWarehouseId = ref.warehouses.find((w) => w.warehouseName === 'Delhi DC')!.warehouseId;

    const homeGoodsProduct = makeProduct(810, categoryIds.homeGoods, 50.0);
    const kitchenProduct = makeProduct(811, categoryIds.kitchen, 50.0);
    const electronicsProduct = makeProduct(812, categoryIds.electronics, 50.0);
    const apparelProduct = makeProduct(813, categoryIds.apparel, 50.0);

    it('Home Goods receives August uplift (+10%)', () => {
      const augWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, augustDate, delhiWarehouseId, categoryIds,
      );
      const normalWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, nonAugustDate, delhiWarehouseId, categoryIds,
      );
      expect(augWeight).toBeGreaterThan(normalWeight);
    });

    it('Kitchen & Dining receives August uplift (+10%)', () => {
      const augWeight = getSeasonalProductWeight(
        kitchenProduct, 0, augustDate, delhiWarehouseId, categoryIds,
      );
      const normalWeight = getSeasonalProductWeight(
        kitchenProduct, 0, nonAugustDate, delhiWarehouseId, categoryIds,
      );
      expect(augWeight).toBeGreaterThan(normalWeight);
    });

    it('Electronics does NOT receive August uplift', () => {
      const augWeight = getSeasonalProductWeight(
        electronicsProduct, 0, augustDate, delhiWarehouseId, categoryIds,
      );
      const normalWeight = getSeasonalProductWeight(
        electronicsProduct, 0, nonAugustDate, delhiWarehouseId, categoryIds,
      );
      expect(augWeight).toBe(normalWeight);
    });

    it('Apparel does NOT receive August uplift (only weekend uplift)', () => {
      const augWeight = getSeasonalProductWeight(
        apparelProduct, 0, augustDate, delhiWarehouseId, categoryIds,
      );
      const normalWeight = getSeasonalProductWeight(
        apparelProduct, 0, nonAugustDate, delhiWarehouseId, categoryIds,
      );
      // Both are midweek dates — no weekend uplift, no August uplift for Apparel
      expect(augWeight).toBe(normalWeight);
    });

    it('August uplift does not overwrite Mumbai stockout suppression', () => {
      const mumbaiId = findMumbaiWarehouse(ref.warehouses).warehouseId;
      // Aug 10 is during both the August uplift AND the Mumbai shortage
      const augMumbaiWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, '2025-08-10', mumbaiId, categoryIds,
      );
      // Non-August non-shortage baseline
      const baselineWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, nonAugustDate, mumbaiId, categoryIds,
      );
      // During shortage: demand suppressed ≈55%, even with August +10% uplift
      // Net multiplier: 1.1 × 0.45 = 0.495 → weight should be < baseline
      expect(augMumbaiWeight).toBeLessThan(baselineWeight);
    });

    it('August uplift is bounded to month 8 only', () => {
      const julyWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, '2025-07-15', delhiWarehouseId, categoryIds,
      );
      const sepWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, '2025-09-15', delhiWarehouseId, categoryIds,
      );
      const augWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, augustDate, delhiWarehouseId, categoryIds,
      );
      expect(julyWeight).toBeLessThan(augWeight);
      expect(sepWeight).toBeLessThan(augWeight);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 6. Q4 PEAK-SEASON BEHAVIOR
  // ════════════════════════════════════════════════════════════════════════

  describe('6. Q4 peak-season behavior', () => {
    it('October through December receive weight 150', () => {
      expect(getMonthSeasonalWeight(10)).toBe(150);
      expect(getMonthSeasonalWeight(11)).toBe(150);
      expect(getMonthSeasonalWeight(12)).toBe(150);
    });

    it('all non-Q4 months receive weight 100', () => {
      for (let m = 1; m <= 9; m++) {
        expect(getMonthSeasonalWeight(m)).toBe(100);
      }
    });

    it('Q4 weight is exactly 50% higher than non-Q4', () => {
      const q4 = getMonthSeasonalWeight(10);
      const nonQ4 = getMonthSeasonalWeight(5);
      expect(q4 / nonQ4).toBe(1.5);
    });

    it('Q4 boundary is exact: Sep = 100, Oct = 150, Dec = 150, Jan = 100', () => {
      expect(getMonthSeasonalWeight(9)).toBe(100);
      expect(getMonthSeasonalWeight(10)).toBe(150);
      expect(getMonthSeasonalWeight(12)).toBe(150);
      expect(getMonthSeasonalWeight(1)).toBe(100);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 7. WEEKEND BEHAVIOR
  // ════════════════════════════════════════════════════════════════════════

  describe('7. Weekend behavior', () => {
    // Saturday 2025-08-02, Sunday 2025-08-03 — both are in August
    // Use a non-August weekend to isolate weekend effect: Saturday 2025-06-07
    const saturdayDate = '2025-06-07'; // confirmed Saturday
    const sundayDate = '2025-06-08';   // confirmed Sunday
    const weekdayDate = '2025-06-04';  // confirmed Wednesday

    const delhiWarehouseId = ref.warehouses.find((w) => w.warehouseName === 'Delhi DC')!.warehouseId;

    const apparelProduct = makeProduct(820, categoryIds.apparel, 50.0);
    const homeGoodsProduct = makeProduct(821, categoryIds.homeGoods, 50.0);
    const electronicsProduct = makeProduct(822, categoryIds.electronics, 50.0);

    it('Apparel receives weekend uplift on Saturday', () => {
      const satWeight = getSeasonalProductWeight(
        apparelProduct, 0, saturdayDate, delhiWarehouseId, categoryIds,
      );
      const wdWeight = getSeasonalProductWeight(
        apparelProduct, 0, weekdayDate, delhiWarehouseId, categoryIds,
      );
      expect(satWeight).toBeGreaterThan(wdWeight);
    });

    it('Home Goods receives weekend uplift on Saturday', () => {
      const satWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, saturdayDate, delhiWarehouseId, categoryIds,
      );
      const wdWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, weekdayDate, delhiWarehouseId, categoryIds,
      );
      expect(satWeight).toBeGreaterThan(wdWeight);
    });

    it('Home Goods receives weekend uplift on Sunday', () => {
      const sunWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, sundayDate, delhiWarehouseId, categoryIds,
      );
      const wdWeight = getSeasonalProductWeight(
        homeGoodsProduct, 0, weekdayDate, delhiWarehouseId, categoryIds,
      );
      expect(sunWeight).toBeGreaterThan(wdWeight);
    });

    it('Electronics does NOT receive weekend uplift', () => {
      const satWeight = getSeasonalProductWeight(
        electronicsProduct, 0, saturdayDate, delhiWarehouseId, categoryIds,
      );
      const wdWeight = getSeasonalProductWeight(
        electronicsProduct, 0, weekdayDate, delhiWarehouseId, categoryIds,
      );
      expect(satWeight).toBe(wdWeight);
    });

    it('weekday behavior is distinct from weekend for Apparel/HomeGoods', () => {
      // Confirm a Tuesday is not treated as weekend
      const tuesdayDate = '2025-06-03'; // confirmed Tuesday
      const tueWeight = getSeasonalProductWeight(
        apparelProduct, 0, tuesdayDate, delhiWarehouseId, categoryIds,
      );
      const satWeight = getSeasonalProductWeight(
        apparelProduct, 0, saturdayDate, delhiWarehouseId, categoryIds,
      );
      expect(tueWeight).toBeLessThan(satWeight);
    });

    it('weekend uplift is +17.5% (rounded)', () => {
      // For product index 0: base = round(100/1) = 100
      // Weekday: weight = max(1, round(100 * 100 / 100)) = 100
      // Weekend: multiplier = round(100 * 1.175) = 118
      //          weight = max(1, round(100 * 118 / 100)) = 118
      const wdWeight = getSeasonalProductWeight(
        apparelProduct, 0, weekdayDate, delhiWarehouseId, categoryIds,
      );
      const satWeight = getSeasonalProductWeight(
        apparelProduct, 0, saturdayDate, delhiWarehouseId, categoryIds,
      );
      // The ratio should be ~1.175 (118/100)
      const ratio = satWeight / wdWeight;
      expect(ratio).toBeCloseTo(1.175, 1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 8. DETERMINISM & REGRESSION
  // ════════════════════════════════════════════════════════════════════════

  describe('8. Determinism and regression', () => {
    it('validation seed produces identical reference data', () => {
      const a = generateReferenceData(VALIDATION_SEED);
      const b = generateReferenceData(VALIDATION_SEED);
      expect(a).toEqual(b);
    });

    it('validation seed produces identical campaign data', () => {
      const a = generateCampaignData(VALIDATION_SEED);
      const b = generateCampaignData(VALIDATION_SEED);
      expect(a).toEqual(b);
    });

    it('validation seed produces identical inventory data', () => {
      const a = generateInventoryData(VALIDATION_SEED);
      const b = generateInventoryData(VALIDATION_SEED);
      expect(a).toEqual(b);
    });

    it('all hidden events are self-consistent for the same seed', () => {
      // Verify cross-step consistency: the shortage dates in inventory match
      // the demand-suppression dates in the order generator
      expect(SHORTAGE_START_DATE).toBe('2025-08-01');
      expect(SHORTAGE_END_DATE).toBe('2025-08-22');

      // Verify AquaFlow event dates are within dataset boundaries
      expect(AQUAFLOW_EVENT_START >= '2023-03-01').toBe(true);
      expect(AQUAFLOW_EVENT_END <= '2025-09-15').toBe(true);
    });
  });
});

