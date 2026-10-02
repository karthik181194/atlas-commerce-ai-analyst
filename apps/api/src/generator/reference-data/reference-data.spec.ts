import { ACTIVE_DATASET } from '../generator.config';
import { generateReferenceData } from './reference-data';

describe('reference data generator', () => {
  const data = generateReferenceData();
  it('generates the required static entities and configured product count', () => {
    expect(data.warehouses).toHaveLength(4); expect(data.regions).toHaveLength(5); expect(data.customerSegments).toHaveLength(4); expect(data.productCategories).toHaveLength(6); expect(data.products).toHaveLength(ACTIVE_DATASET.products);
  });
  it('preserves warehouse relationships', () => {
    expect(data.regions.every((region) => data.warehouses.some((warehouse) => warehouse.warehouseId === region.defaultWarehouseId))).toBe(true);
    expect(data.regions.filter((region) => ['South', 'East'].includes(region.regionName)).every((region) => region.defaultWarehouseId === 2)).toBe(true);
  });
  it('generates valid, deterministic products', () => {
    expect(data.products.every((product) => data.productCategories.some((category) => category.categoryId === product.categoryId) && product.unitPrice > 0 && product.unitCost > 0)).toBe(true);
    expect(new Set(data.products.map((product) => product.productName)).size).toBe(data.products.length);
    for (const product of data.products) { const margin = (product.unitPrice - product.unitCost) / product.unitPrice; const category = data.productCategories.find((entry) => entry.categoryId === product.categoryId)!; expect(margin).toBeCloseTo(category.targetMarginBps / 10_000, 2); }
    expect(generateReferenceData(ACTIVE_DATASET.seed)).toEqual(generateReferenceData(ACTIVE_DATASET.seed));
    expect(generateReferenceData(ACTIVE_DATASET.seed + 1).products).not.toEqual(data.products);
  });

  describe('AquaFlow Blender', () => {
    const aquaflow = data.products.find((p) => p.productName === 'AquaFlow Blender');

    it('exists in the generated product data', () => {
      expect(aquaflow).toBeDefined();
    });

    it('belongs to Kitchen & Dining category', () => {
      const kitchenCategory = data.productCategories.find((c) => c.categoryName === 'Kitchen & Dining')!;
      expect(aquaflow!.categoryId).toBe(kitchenCategory.categoryId);
    });

    it('has valid price, cost, and launch date', () => {
      expect(aquaflow!.unitPrice).toBeGreaterThan(0);
      expect(aquaflow!.unitCost).toBeGreaterThan(0);
      expect(aquaflow!.unitCost).toBeLessThan(aquaflow!.unitPrice);
      expect(aquaflow!.launchDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(aquaflow!.isActive).toBe(true);
    });

    it('has margin consistent with Kitchen & Dining target', () => {
      const kitchenCategory = data.productCategories.find((c) => c.categoryName === 'Kitchen & Dining')!;
      const margin = (aquaflow!.unitPrice - aquaflow!.unitCost) / aquaflow!.unitPrice;
      expect(margin).toBeCloseTo(kitchenCategory.targetMarginBps / 10_000, 2);
    });

    it('is identical across calls with the same seed', () => {
      const data2 = generateReferenceData(ACTIVE_DATASET.seed);
      const aquaflow2 = data2.products.find((p) => p.productName === 'AquaFlow Blender');
      expect(aquaflow2).toEqual(aquaflow);
    });

    it('is present regardless of seed', () => {
      const altData = generateReferenceData(ACTIVE_DATASET.seed + 1);
      const altAquaflow = altData.products.find((p) => p.productName === 'AquaFlow Blender');
      expect(altAquaflow).toBeDefined();
      expect(altAquaflow!.productName).toBe('AquaFlow Blender');
      // Same hardcoded properties regardless of seed
      expect(altAquaflow!.unitPrice).toBe(aquaflow!.unitPrice);
      expect(altAquaflow!.unitCost).toBe(aquaflow!.unitCost);
    });

    it('is always the last product in the list', () => {
      expect(data.products[data.products.length - 1].productName).toBe('AquaFlow Blender');
      const altData = generateReferenceData(ACTIVE_DATASET.seed + 1);
      expect(altData.products[altData.products.length - 1].productName).toBe('AquaFlow Blender');
    });
  });
});
