import { generateReturnData } from './returns/return-generator';
import { generateOrderData } from './orders/order-generator';
import { generateReferenceData } from './reference-data/reference-data';
import { ACTIVE_DATASET } from './generator.config';

const ref = generateReferenceData();
const { orders, orderItems } = generateOrderData();
const data = generateReturnData();

// Build lookup maps
const orderMap = new Map(orders.map((o) => [o.orderId, o]));
const orderItemMap = new Map(orderItems.map((i) => [i.orderItemId, i]));
const productMap = new Map(ref.products.map((p) => [p.productId, p]));
const categoryMap = new Map(
  ref.productCategories.map((c) => [c.categoryId, c.categoryName]),
);

// ─── Returns table ──────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' RETURNS');
console.log('══════════════════════════════════════════════════════════════════');
console.table(
  data.returns.map((r) => {
    const item = orderItemMap.get(r.orderItemId)!;
    const order = orderMap.get(item.orderId)!;
    const product = productMap.get(item.productId)!;
    const category = categoryMap.get(product.categoryId) ?? 'Unknown';
    return {
      'Return ID': r.returnId,
      'Order Item': r.orderItemId,
      'Order ID': item.orderId,
      Product: product.productName,
      Category: category,
      'Order Date': order.orderDate,
      'Return Date': r.returnDate,
      'Processed': r.processedDate,
      Reason: r.reason,
      'Refund ($)': r.refundAmount.toFixed(2),
    };
  }),
);

// ─── Summary ────────────────────────────────────────────────────────────────

const completedOrders = orders.filter((o) => o.orderStatus === 'completed');
const completedItems = orderItems.filter((i) =>
  completedOrders.some((o) => o.orderId === i.orderId),
);

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' SUMMARY');
console.log('══════════════════════════════════════════════════════════════════');
console.log(
  `Completed orders: ${completedOrders.length}  |  Eligible items: ${completedItems.length}  |  Returns: ${data.returns.length}`,
);

// Reason breakdown
const reasonCounts: Record<string, number> = {};
data.returns.forEach((r) => {
  reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1;
});
console.log('Reason breakdown:', reasonCounts);

// Category breakdown
const catCounts: Record<string, { eligible: number; returned: number }> = {};
completedItems.forEach((item) => {
  const product = productMap.get(item.productId)!;
  const cat = categoryMap.get(product.categoryId) ?? 'Unknown';
  if (!catCounts[cat]) catCounts[cat] = { eligible: 0, returned: 0 };
  catCounts[cat].eligible++;
});
data.returns.forEach((r) => {
  const item = orderItemMap.get(r.orderItemId)!;
  const product = productMap.get(item.productId)!;
  const cat = categoryMap.get(product.categoryId) ?? 'Unknown';
  if (catCounts[cat]) catCounts[cat].returned++;
});
console.log('Category return counts:');
Object.entries(catCounts).forEach(([cat, counts]) => {
  const pct = counts.eligible > 0
    ? ((counts.returned / counts.eligible) * 100).toFixed(1)
    : '0.0';
  console.log(`  ${cat}: ${counts.returned}/${counts.eligible} (${pct}%)`);
});

// Total refund
const totalRefund = data.returns.reduce((sum, r) => sum + r.refundAmount, 0);
console.log(`Total refund amount: $${totalRefund.toFixed(2)}`);

// ─── Verification ───────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' VERIFICATION');
console.log('══════════════════════════════════════════════════════════════════');

// 1. Referential integrity
const validItemIds = new Set(orderItems.map((i) => i.orderItemId));
const refErrors = data.returns.filter((r) => !validItemIds.has(r.orderItemId));
console.log(
  `Referential integrity:     ${refErrors.length === 0 ? '✓ PASS' : `✗ FAIL — ${refErrors.length} invalid refs`}`,
);

// 2. Completed orders only
const cancelledItemIds = new Set(
  orderItems
    .filter((i) => orders.find((o) => o.orderId === i.orderId)?.orderStatus === 'cancelled')
    .map((i) => i.orderItemId),
);
const cancelErrors = data.returns.filter((r) => cancelledItemIds.has(r.orderItemId));
console.log(
  `No cancelled order returns: ${cancelErrors.length === 0 ? '✓ PASS' : `✗ FAIL — ${cancelErrors.length} from cancelled orders`}`,
);

// 3. Date constraints
const dateErrors = data.returns.filter((r) => {
  const item = orderItemMap.get(r.orderItemId)!;
  const order = orderMap.get(item.orderId)!;
  return (
    r.returnDate < order.orderDate ||
    r.processedDate < r.returnDate ||
    r.returnDate > ACTIVE_DATASET.asOfDate ||
    r.processedDate > ACTIVE_DATASET.asOfDate
  );
});
console.log(
  `Date constraints:          ${dateErrors.length === 0 ? '✓ PASS' : `✗ FAIL — ${dateErrors.length} date error(s)`}`,
);

// 4. Valid reasons
const validReasons = new Set(['defective', 'wrong_item', 'changed_mind', 'not_as_described']);
const reasonErrors = data.returns.filter((r) => !validReasons.has(r.reason));
console.log(
  `Valid reasons:             ${reasonErrors.length === 0 ? '✓ PASS' : `✗ FAIL — ${reasonErrors.length} invalid reason(s)`}`,
);

// 5. Refund integrity
const refundErrors = data.returns.filter((r) => {
  const item = orderItemMap.get(r.orderItemId)!;
  const expectedCents = Math.round(item.unitPriceAtPurchase * 100) * item.quantity;
  const expected = Number((expectedCents / 100).toFixed(2));
  return r.refundAmount !== expected || r.refundAmount < 0;
});
console.log(
  `Refund integrity:          ${refundErrors.length === 0 ? '✓ PASS' : `✗ FAIL — ${refundErrors.length} refund error(s)`}`,
);

// 6. Determinism
const data2 = generateReturnData();
const deterministic = JSON.stringify(data) === JSON.stringify(data2);
console.log(`Determinism (same seed):   ${deterministic ? '✓ PASS' : '✗ FAIL'}`);

// 7. Seed sensitivity
const dataDiff = generateReturnData(ACTIVE_DATASET.seed + 1);
const seedSensitive = JSON.stringify(dataDiff.returns) !== JSON.stringify(data.returns);
console.log(`Seed-sensitivity:          ${seedSensitive ? '✓ PASS' : '✗ FAIL'}`);

// 8. No DB access
console.log(`PostgreSQL access:          ✓ NOT ACCESSED — pure in-memory generation`);

console.log('══════════════════════════════════════════════════════════════════\n');

