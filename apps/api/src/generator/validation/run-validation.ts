import { generateReferenceData } from '../reference-data/reference-data';
import { generateCampaignData } from '../campaigns/campaign-generator';
import { generateInventoryData } from '../inventory/inventory-generator';
import {
  SHORTAGE_WAREHOUSE_NAME,
  SHORTAGE_START_DATE,
  SHORTAGE_END_DATE,
  findMumbaiWarehouse,
} from '../inventory/inventory-generator';
import {
  AQUAFLOW_PRODUCT_NAME,
  AQUAFLOW_EVENT_START,
  AQUAFLOW_EVENT_END,
  getReturnRate,
} from '../returns/return-generator';
import {
  calculateUnitPrice,
  getInventoryShortageMultiplier,
  getMonthSeasonalWeight,
  getSeasonalProductWeight,
  matchCampaign,
} from '../orders/order-generator';

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' STEP 8: HIDDEN-EVENT VALIDATION REPORT');
console.log('══════════════════════════════════════════════════════════════════');

const ref = generateReferenceData();
const mumbaiWh = findMumbaiWarehouse(ref.warehouses);
const homeGoodsCat = ref.productCategories.find((c) => c.categoryName === 'Home Goods')!;
const electronicsCat = ref.productCategories.find((c) => c.categoryName === 'Electronics')!;
const kitchenCat = ref.productCategories.find((c) => c.categoryName === 'Kitchen & Dining')!;
const apparelCat = ref.productCategories.find((c) => c.categoryName === 'Apparel')!;

// 1. Mumbai Shortage
const invData = generateInventoryData();
const shortageEvents = invData.inventoryEvents.filter(
  (e) => e.eventType === 'shortage_start' || e.eventType === 'shortage_end',
);
console.log('\n1. Mumbai DC Home Goods Shortage:');
console.log(`   - Warehouse: ${mumbaiWh.warehouseName} (ID: ${mumbaiWh.warehouseId})`);
console.log(`   - Window: ${SHORTAGE_START_DATE} to ${SHORTAGE_END_DATE}`);
console.log(`   - Shortage Events Generated: ${shortageEvents.length}`);

// 2. AquaFlow Quality Event
console.log('\n2. AquaFlow Blender Quality Event:');
console.log(`   - Target Product: ${AQUAFLOW_PRODUCT_NAME}`);
console.log(`   - Window: ${AQUAFLOW_EVENT_START} to ${AQUAFLOW_EVENT_END}`);
console.log(
  `   - Rate During: ${getReturnRate('Kitchen & Dining', '2025-08-01', AQUAFLOW_PRODUCT_NAME)}/1000 (~25%)`,
);
console.log(
  `   - Rate Outside: ${getReturnRate('Kitchen & Dining', '2025-07-01', AQUAFLOW_PRODUCT_NAME)}/1000 (~5%)`,
);

// 3. Summer Loyalty Push Campaign
const campData = generateCampaignData();
const slp = campData.campaigns.find((c) => c.campaignName === 'Summer Loyalty Push')!;
const slpSpend = campData.campaignSpend.filter((s) => s.campaignId === slp.campaignId);
console.log('\n3. Summer Loyalty Push:');
console.log(`   - Campaign ID: ${slp.campaignId}`);
console.log(`   - Active Dates: ${slp.startDate} to ${slp.endDate}`);
console.log(`   - Total Spend Records: ${slpSpend.length}`);
console.log(
  `   - Last Spend Date: ${slpSpend[slpSpend.length - 1]?.spendDate}`,
);

// 4. Electronics Price Increase (+6% from June 1, 2025)
const testElecProduct = {
  productId: 999,
  productName: 'Test Electronics',
  categoryId: electronicsCat.categoryId,
  unitPrice: 100.0,
  unitCost: 70.0,
  launchDate: '2023-01-01',
  isActive: true,
};
const pPre = calculateUnitPrice(testElecProduct, '2025-05-31', electronicsCat.categoryId);
const pPost = calculateUnitPrice(testElecProduct, '2025-06-01', electronicsCat.categoryId);
console.log('\n4. Electronics Price Event:');
console.log(`   - Pre-June 1 (2025-05-31): $${pPre.toFixed(2)}`);
console.log(`   - Post-June 1 (2025-06-01): $${pPost.toFixed(2)} (+6.00%)`);

// 5. Seasonal, Weekend & Q4 Weights
console.log('\n5. Seasonal & Temporal Logic:');
console.log(`   - Non-Q4 Month Weight (May): ${getMonthSeasonalWeight(5)}`);
console.log(`   - Q4 Month Weight (Nov): ${getMonthSeasonalWeight(11)} (+50%)`);

console.log('══════════════════════════════════════════════════════════════════\n');
