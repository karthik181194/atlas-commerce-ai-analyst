import { DEVELOPMENT_DATASET } from '../generator.config';
import { generateReferenceData } from './reference-data';

describe('reference data generator', () => {
  const data = generateReferenceData();
  it('generates the required static entities and configured product count', () => {
    expect(data.warehouses).toHaveLength(4); expect(data.regions).toHaveLength(5); expect(data.customerSegments).toHaveLength(4); expect(data.productCategories).toHaveLength(6); expect(data.products).toHaveLength(DEVELOPMENT_DATASET.products);
  });
  it('preserves warehouse relationships', () => {
    expect(data.regions.every((region) => data.warehouses.some((warehouse) => warehouse.warehouseId === region.defaultWarehouseId))).toBe(true);
    expect(data.regions.filter((region) => ['South', 'East'].includes(region.regionName)).every((region) => region.defaultWarehouseId === 2)).toBe(true);
  });
  it('generates valid, deterministic products', () => {
    expect(data.products.every((product) => data.productCategories.some((category) => category.categoryId === product.categoryId) && product.unitPrice > 0 && product.unitCost > 0)).toBe(true);
    expect(new Set(data.products.map((product) => product.productName)).size).toBe(data.products.length);
    for (const product of data.products) { const margin = (product.unitPrice - product.unitCost) / product.unitPrice; const category = data.productCategories.find((entry) => entry.categoryId === product.categoryId)!; expect(margin).toBeCloseTo(category.targetMarginBps / 10_000, 2); }
    expect(generateReferenceData(DEVELOPMENT_DATASET.seed)).toEqual(generateReferenceData(DEVELOPMENT_DATASET.seed));
    expect(generateReferenceData(DEVELOPMENT_DATASET.seed + 1).products).not.toEqual(data.products);
  });
});
