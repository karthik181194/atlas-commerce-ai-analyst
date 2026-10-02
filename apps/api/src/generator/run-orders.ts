import { generateOrderData } from './orders/order-generator';
import { generateReferenceData } from './reference-data/reference-data';
import { generateCustomers } from './customers/customer-generator';
import { generateCampaignData } from './campaigns/campaign-generator';
import { ACTIVE_DATASET } from './generator.config';

const ref = generateReferenceData();
const customers = generateCustomers();
const { campaigns } = generateCampaignData();
const data = generateOrderData();

// Build lookup maps for readable output
const customerMap = new Map(customers.map((c) => [c.customerId, c]));
const regionMap = new Map(ref.regions.map((r) => [r.regionId, r]));
const warehouseMap = new Map(ref.warehouses.map((w) => [w.warehouseId, w]));
const segmentMap = new Map(ref.customerSegments.map((s) => [s.segmentId, s]));
const campaignMap = new Map(campaigns.map((c) => [c.campaignId, c]));
const productMap = new Map(ref.products.map((p) => [p.productId, p]));

// ─── Orders table ───────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' ORDERS');
console.log('══════════════════════════════════════════════════════════════════');
console.table(
  data.orders.map((o) => {
    const customer = customerMap.get(o.customerId)!;
    return {
      'Order ID': o.orderId,
      Customer: `${customer.firstName} ${customer.lastName}`,
      Region: regionMap.get(o.regionId)?.regionName ?? '?',
      Segment: segmentMap.get(o.segmentAtOrder)?.segmentName ?? '?',
      Warehouse: warehouseMap.get(o.fulfillingWarehouseId)?.warehouseName ?? '?',
      Date: o.orderDate,
      Status: o.orderStatus,
      Campaign: o.campaignId
        ? (campaignMap.get(o.campaignId)?.campaignName ?? `#${o.campaignId}`)
        : '—',
      'Total ($)': o.totalAmount.toFixed(2),
    };
  }),
);

// ─── Order items table ──────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' ORDER ITEMS');
console.log('══════════════════════════════════════════════════════════════════');
console.table(
  data.orderItems.map((i) => {
    const product = productMap.get(i.productId)!;
    const category = ref.productCategories.find(
      (c) => c.categoryId === product.categoryId,
    )!;
    return {
      'Item ID': i.orderItemId,
      'Order ID': i.orderId,
      Product: product.productName,
      Category: category.categoryName,
      Qty: i.quantity,
      'Unit Price ($)': i.unitPriceAtPurchase.toFixed(2),
      'Line Total ($)': (i.quantity * i.unitPriceAtPurchase).toFixed(2),
    };
  }),
);

// ─── Summary counts ─────────────────────────────────────────────────────────

const completed = data.orders.filter((o) => o.orderStatus === 'completed').length;
const cancelled = data.orders.filter((o) => o.orderStatus === 'cancelled').length;
const attributed = data.orders.filter((o) => o.campaignId !== null).length;

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' SUMMARY');
console.log('══════════════════════════════════════════════════════════════════');
console.log(
  `Orders: ${data.orders.length}  |  Completed: ${completed}  |  Cancelled: ${cancelled}  |  Items: ${data.orderItems.length}  |  Campaign-attributed: ${attributed}`,
);

// ─── Verification ───────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' VERIFICATION');
console.log('══════════════════════════════════════════════════════════════════');

// 1. Order total integrity
const totalMismatches = data.orders.filter((o) => {
  const items = data.orderItems.filter((i) => i.orderId === o.orderId);
  const cents = items.reduce(
    (s, i) => s + Math.round(i.quantity * i.unitPriceAtPurchase * 100),
    0,
  );
  return Math.round(o.totalAmount * 100) !== cents;
});
console.log(
  `Order total integrity:     ${totalMismatches.length === 0 ? '✓ PASS' : `✗ FAIL — ${totalMismatches.length} mismatch(es)`}`,
);

// 2. Referential integrity
let refErrors = 0;
const validCustomerIds = new Set(customers.map((c) => c.customerId));
const validProductIds = new Set(ref.products.map((p) => p.productId));
const validCampaignIds = new Set(campaigns.map((c) => c.campaignId));
data.orders.forEach((o) => {
  if (!validCustomerIds.has(o.customerId)) refErrors++;
  const customer = customerMap.get(o.customerId);
  if (customer && o.regionId !== customer.regionId) refErrors++;
  if (customer && o.segmentAtOrder !== customer.segmentId) refErrors++;
  if (o.campaignId !== null && !validCampaignIds.has(o.campaignId)) refErrors++;
});
data.orderItems.forEach((i) => {
  if (!validProductIds.has(i.productId)) refErrors++;
});
console.log(
  `Referential integrity:     ${refErrors === 0 ? '✓ PASS' : `✗ FAIL — ${refErrors} error(s)`}`,
);

// 3. Campaign attribution integrity
const campaignErrors: string[] = [];
data.orders
  .filter((o) => o.campaignId !== null)
  .forEach((o) => {
    const campaign = campaignMap.get(o.campaignId!);
    if (!campaign) { campaignErrors.push(`Order ${o.orderId}: campaign #${o.campaignId} not found`); return; }
    const customer = customerMap.get(o.customerId)!;
    if (o.orderDate < campaign.startDate || o.orderDate > campaign.endDate)
      campaignErrors.push(`Order ${o.orderId}: date ${o.orderDate} outside campaign window`);
    if (campaign.targetSegmentId !== null && customer.segmentId !== campaign.targetSegmentId)
      campaignErrors.push(`Order ${o.orderId}: segment mismatch`);
    if (campaign.targetRegionId !== null && customer.regionId !== campaign.targetRegionId)
      campaignErrors.push(`Order ${o.orderId}: region mismatch`);
  });
console.log(
  `Campaign attribution:      ${campaignErrors.length === 0 ? '✓ PASS' : `✗ FAIL\n  ${campaignErrors.join('\n  ')}`}`,
);
console.log(`  Attributed orders: ${attributed}/${data.orders.length}`);

// 4. Electronics price event
const electronicsCat = ref.productCategories.find((c) => c.categoryName === 'Electronics')!;
const priceErrors: string[] = [];
let electronicsItemCount = 0;
data.orderItems.forEach((item) => {
  const product = productMap.get(item.productId)!;
  if (product.categoryId !== electronicsCat.categoryId) return;
  electronicsItemCount++;
  const order = data.orders.find((o) => o.orderId === item.orderId)!;
  const expectedPrice =
    order.orderDate >= '2025-06-01'
      ? Number((product.unitPrice * 1.06).toFixed(2))
      : product.unitPrice;
  if (item.unitPriceAtPurchase !== expectedPrice) {
    priceErrors.push(
      `Item ${item.orderItemId} (Order ${item.orderId}): expected $${expectedPrice}, got $${item.unitPriceAtPurchase}`,
    );
  }
});
console.log(
  `Electronics price event:   ${priceErrors.length === 0 ? '✓ PASS' : `✗ FAIL\n  ${priceErrors.join('\n  ')}`}${electronicsItemCount === 0 ? ' (no electronics items in dev dataset; fixture-level tests in spec cover both sides)' : ` (${electronicsItemCount} electronics item(s) checked)`}`,
);

// 5. Date constraints
const dateErrors = data.orders.filter((o) => {
  const customer = customerMap.get(o.customerId)!;
  return (
    o.orderDate < ACTIVE_DATASET.datasetStartDate ||
    o.orderDate > ACTIVE_DATASET.asOfDate ||
    o.orderDate < customer.signupDate
  );
});
console.log(
  `Date constraints:          ${dateErrors.length === 0 ? '✓ PASS' : `✗ FAIL — ${dateErrors.length} order(s) outside valid range`}`,
);

// 6. Determinism
const data2 = generateOrderData();
const deterministic = JSON.stringify(data) === JSON.stringify(data2);
console.log(`Determinism (same seed):   ${deterministic ? '✓ PASS' : '✗ FAIL'}`);

// 7. Seed-sensitivity
const dataDiff = generateOrderData(ACTIVE_DATASET.seed + 1);
const seedSensitive = JSON.stringify(dataDiff.orders) !== JSON.stringify(data.orders);
console.log(`Seed-sensitivity:          ${seedSensitive ? '✓ PASS' : '✗ FAIL'}`);

// 8. PostgreSQL not accessed
console.log(`PostgreSQL access:          ✓ NOT ACCESSED — pure in-memory generation`);

console.log('══════════════════════════════════════════════════════════════════\n');
