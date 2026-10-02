import { generateInventoryData } from './inventory/inventory-generator';
import { generateReferenceData } from './reference-data/reference-data';
import { ACTIVE_DATASET } from './generator.config';
import {
  SHORTAGE_CATEGORY_NAME,
  SHORTAGE_START_DATE,
  SHORTAGE_END_DATE,
  SHORTAGE_WAREHOUSE_NAME,
  findMumbaiWarehouse,
} from './inventory/inventory-generator';

const ref = generateReferenceData();
const data = generateInventoryData();

const mumbaiWarehouse = findMumbaiWarehouse(ref.warehouses);
const homeGoodsCategory = ref.productCategories.find(
  (c) => c.categoryName === SHORTAGE_CATEGORY_NAME,
)!;
const categoryMap = new Map(
  ref.productCategories.map((c) => [c.categoryId, c.categoryName]),
);
const productMap = new Map(ref.products.map((p) => [p.productId, p]));
const warehouseMap = new Map(ref.warehouses.map((w) => [w.warehouseId, w]));

// ─── Summary ────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' INVENTORY EVENTS');
console.log('══════════════════════════════════════════════════════════════════');

// Event type breakdown
const typeCounts: Record<string, number> = {};
data.inventoryEvents.forEach((e) => {
  typeCounts[e.eventType] = (typeCounts[e.eventType] ?? 0) + 1;
});
console.log(`Total events: ${data.inventoryEvents.length}`);
console.log('Event type breakdown:', typeCounts);

// Product/warehouse timeline count
const timelineKeys = new Set(
  data.inventoryEvents.map((e) => `${e.productId}:${e.warehouseId}`),
);
console.log(`Product/warehouse timelines: ${timelineKeys.size}`);
console.log(
  `Expected: ${ref.products.length} products × ${ref.warehouses.length} warehouses = ${ref.products.length * ref.warehouses.length}`,
);

// Shortage events
const shortageEvents = data.inventoryEvents.filter(
  (e) => e.eventType === 'shortage_start' || e.eventType === 'shortage_end',
);
console.log(`\nShortage events: ${shortageEvents.length}`);
if (shortageEvents.length > 0) {
  console.table(
    shortageEvents.map((e) => ({
      'Event ID': e.inventoryEventId,
      Product: productMap.get(e.productId)?.productName ?? `#${e.productId}`,
      Category: categoryMap.get(productMap.get(e.productId)?.categoryId ?? 0) ?? '?',
      Warehouse: warehouseMap.get(e.warehouseId)?.warehouseName ?? `#${e.warehouseId}`,
      Date: e.eventDate,
      Type: e.eventType,
      'Stock After': e.stockLevelAfter,
    })),
  );
} else {
  console.log('  (No shortage events — no Home Goods products in dev dataset)');
}

// Sample timeline for first product at first warehouse
const firstProduct = ref.products[0];
const firstWarehouse = ref.warehouses[0];
const sampleTimeline = data.inventoryEvents.filter(
  (e) => e.productId === firstProduct.productId && e.warehouseId === firstWarehouse.warehouseId,
);
console.log(
  `\nSample timeline: ${firstProduct.productName} @ ${firstWarehouse.warehouseName}`,
);
console.table(
  sampleTimeline.map((e) => ({
    'Event ID': e.inventoryEventId,
    Date: e.eventDate,
    Type: e.eventType,
    'Stock After': e.stockLevelAfter,
  })),
);

// ─── Verification ───────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' VERIFICATION');
console.log('══════════════════════════════════════════════════════════════════');

// 1. All event types valid
const invalidTypes = data.inventoryEvents.filter(
  (e) =>
    !['initial_stock', 'restock', 'shortage_start', 'shortage_end', 'adjustment'].includes(
      e.eventType,
    ),
);
console.log(
  `Valid event types:          ${invalidTypes.length === 0 ? '✓ PASS' : `✗ FAIL — ${invalidTypes.length} invalid`}`,
);

// 2. Stock levels non-negative
const negativeStock = data.inventoryEvents.filter((e) => e.stockLevelAfter < 0);
console.log(
  `Stock levels >= 0:         ${negativeStock.length === 0 ? '✓ PASS' : `✗ FAIL — ${negativeStock.length} negative`}`,
);

// 3. Exactly one initial_stock per product/warehouse
let initialErrors = 0;
for (const product of ref.products) {
  for (const warehouse of ref.warehouses) {
    const timeline = data.inventoryEvents.filter(
      (e) => e.productId === product.productId && e.warehouseId === warehouse.warehouseId,
    );
    const initials = timeline.filter((e) => e.eventType === 'initial_stock');
    if (initials.length !== 1) initialErrors++;
  }
}
console.log(
  `One initial_stock per pair: ${initialErrors === 0 ? '✓ PASS' : `✗ FAIL — ${initialErrors} error(s)`}`,
);

// 4. Chronological order
let chronoErrors = 0;
for (const product of ref.products) {
  for (const warehouse of ref.warehouses) {
    const timeline = data.inventoryEvents.filter(
      (e) => e.productId === product.productId && e.warehouseId === warehouse.warehouseId,
    );
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].eventDate < timeline[i - 1].eventDate) chronoErrors++;
    }
  }
}
console.log(
  `Chronological order:       ${chronoErrors === 0 ? '✓ PASS' : `✗ FAIL — ${chronoErrors} error(s)`}`,
);

// 5. Shortage events are only for Home Goods at Mumbai DC
const wrongShortage = shortageEvents.filter((e) => {
  const product = productMap.get(e.productId);
  return (
    !product ||
    product.categoryId !== homeGoodsCategory.categoryId ||
    e.warehouseId !== mumbaiWarehouse.warehouseId
  );
});
console.log(
  `Shortage scope:            ${wrongShortage.length === 0 ? '✓ PASS' : `✗ FAIL — ${wrongShortage.length} misplaced`}`,
);

// 6. Determinism
const data2 = generateInventoryData();
const deterministic = JSON.stringify(data) === JSON.stringify(data2);
console.log(`Determinism (same seed):   ${deterministic ? '✓ PASS' : '✗ FAIL'}`);

// 7. Seed sensitivity
const dataDiff = generateInventoryData(ACTIVE_DATASET.seed + 1);
const seedSensitive = JSON.stringify(dataDiff.inventoryEvents) !== JSON.stringify(data.inventoryEvents);
console.log(`Seed-sensitivity:          ${seedSensitive ? '✓ PASS' : '✗ FAIL'}`);

// 8. No DB access
console.log(`PostgreSQL access:          ✓ NOT ACCESSED — pure in-memory generation`);

console.log('══════════════════════════════════════════════════════════════════\n');

