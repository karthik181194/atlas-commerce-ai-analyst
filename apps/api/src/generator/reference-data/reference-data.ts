import { ACTIVE_DATASET } from '../generator.config';
import { DeterministicRandom } from '../deterministic-random';
import type { CustomerSegment, Product, ProductCategory, ReferenceData, Region, Warehouse } from './types';

const warehouses: Warehouse[] = ['Delhi DC', 'Hyderabad DC', 'Nagpur DC', 'Mumbai DC'].map((warehouseName, index) => ({ warehouseId: index + 1, warehouseName }));
const regions: Region[] = [
  ['North', 1], ['South', 2], ['Central', 3], ['West', 4], ['East', 2],
].map(([regionName, defaultWarehouseId], index) => ({ regionId: index + 1, regionName: regionName as string, defaultWarehouseId: defaultWarehouseId as number }));
const customerSegments: CustomerSegment[] = [
  ['New', '<90 days since signup, 0-1 orders'], ['Occasional', '2-5 lifetime orders'], ['Loyal', '6+ orders, regular 4-8 week cadence'], ['VIP', 'Top approximately 5% by lifetime spend'],
].map(([segmentName, description], index) => ({ segmentId: index + 1, segmentName, description }));
const productCategories: ProductCategory[] = [
  ['Home Goods', 3500], ['Electronics', 1500], ['Apparel', 4500], ['Beauty & Personal Care', 5000], ['Sporting Goods', 3000], ['Kitchen & Dining', 3500],
].map(([categoryName, targetMarginBps], index) => ({ categoryId: index + 1, categoryName: categoryName as string, targetMarginBps: targetMarginBps as number }));
const productWords = ['Aster', 'Luma', 'Nori', 'Vela', 'Kivo', 'Mira', 'Sola', 'Tavi'];

function money(cents: number): number { return Number((cents / 100).toFixed(2)); }
function launchDate(random: DeterministicRandom): string {
  const start = Date.parse(`${ACTIVE_DATASET.datasetStartDate}T00:00:00Z`);
  const end = Date.parse(`${ACTIVE_DATASET.asOfDate}T00:00:00Z`);
  const day = random.nextInt(0, Math.floor((end - start) / 86_400_000));
  return new Date(start + day * 86_400_000).toISOString().slice(0, 10);
}
function generateProducts(seed: number, count: number): Product[] {
  const random = new DeterministicRandom(seed);
  const randomCount = count - 1;
  const products: Product[] = Array.from({ length: randomCount }, (_, index) => {
    const category = productCategories[random.nextInt(0, productCategories.length - 1)];
    const priceCents = random.nextInt(1_000, 20_000);
    const costCents = Math.round(priceCents * (10_000 - category.targetMarginBps) / 10_000);
    return { productId: index + 1, productName: `${productWords[random.nextInt(0, productWords.length - 1)]} ${category.categoryName} ${index + 1}`, categoryId: category.categoryId, unitPrice: money(priceCents), unitCost: money(costCents), launchDate: launchDate(random), isActive: true };
  });
  // Deterministic AquaFlow Blender — always the last product (Kitchen & Dining, V1 quality event target)
  const kitchenCategory = productCategories.find((c) => c.categoryName === 'Kitchen & Dining')!;
  const aquaflowPriceCents = 8999;
  const aquaflowCostCents = Math.round(aquaflowPriceCents * (10_000 - kitchenCategory.targetMarginBps) / 10_000);
  products.push({ productId: count, productName: 'AquaFlow Blender', categoryId: kitchenCategory.categoryId, unitPrice: money(aquaflowPriceCents), unitCost: money(aquaflowCostCents), launchDate: '2024-03-15', isActive: true });
  return products;
}
export function generateReferenceData(seed: number = ACTIVE_DATASET.seed): ReferenceData {
  return { warehouses, regions, customerSegments, productCategories, products: generateProducts(seed, ACTIVE_DATASET.products) };
}
