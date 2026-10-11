import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AnalyticsService } from './src/analytics/analytics.service';
import { SafeQueryService } from './src/analytics/safe-query.service';
import path from 'path';

async function verify() {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../../.env'));
  } catch (e) {
    // Ignore
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const analyticsService = app.get(AnalyticsService);
  const safeQuery = app.get(SafeQueryService);

  try {
    // 1. Initial row counts
    const tables = ['customers', 'products', 'warehouses', 'regions', 'orders', 'order_items', 'returns', 'inventory_events'];
    const initialCounts: Record<string, number> = {};
    for (const t of tables) {
      const res = await safeQuery.executeQuery(`SELECT COUNT(*)::integer as c FROM ${t}`);
      initialCounts[t] = res[0].c;
    }
    console.log('--- Initial Row Counts ---');
    console.log(initialCounts);

    // 2. Run capability
    const range = { startDate: '2025-08-01', endDate: '2025-08-31' };
    console.log(`\nExecuting inventoryStockoutAnalysis for ${range.startDate} to ${range.endDate}...`);
    const result = await analyticsService.inventoryStockoutAnalysis(range);

    console.log('\n--- Discovered Stockout Summary ---');
    console.log(JSON.stringify(result.summary, null, 2));

    console.log('\n--- Regional Impact ---');
    console.log(JSON.stringify(result.regionalImpact, null, 2));

    console.log('\n--- Sample Stockout Events (First 3) ---');
    console.log(JSON.stringify(result.stockoutEvents.slice(0, 3), null, 2));

    console.log('\n--- Top 3 Affected Products by Baseline Revenue ---');
    console.log(JSON.stringify(result.productImpact.slice(0, 3), null, 2));

    // Assertions for expected discoveries
    const mumbaiWarehouseDetected = result.stockoutEvents.some(e => e.warehouseName === 'Mumbai DC');
    const homeGoodsCategoryDetected = result.stockoutEvents.some(e => e.categoryName === 'Home Goods');
    const westRegionDetected = result.regionalImpact.some(r => r.regionName === 'West' && r.regionId === 4);
    const duration22Detected = result.stockoutEvents.every(e => e.stockoutDays === 22 && e.stockoutStart === '2025-08-01' && e.stockoutEnd === '2025-08-22');
    const noNegativeValues = result.productImpact.every(p => p.stockoutDays >= 0 && p.stockoutPeriodOrders >= 0 && p.baselineOrders >= 0 && !isNaN(p.stockoutPeriodRevenue) && !isNaN(p.baselineRevenue));
    const refundsExceedSalesProducts = result.productImpact.filter(p => p.stockoutPeriodRevenue < 0 || p.baselineRevenue < 0);

    console.log('\n--- Verification Checks ---');
    console.log('Stockout events detected:', result.summary.stockoutEventCount > 0);
    console.log('Mumbai warehouse detected:', mumbaiWarehouseDetected);
    console.log('Home Goods category detected:', homeGoodsCategoryDetected);
    console.log('West region mapping correct:', westRegionDetected);
    console.log('Duration is August 1-22 (22 days):', duration22Detected);
    console.log('Product impact populated (156 products):', result.productImpact.length === 156);
    console.log('No negative/invalid values:', noNegativeValues);

    // 3. Final row counts integrity check
    const finalCounts: Record<string, number> = {};
    let countsIntact = true;
    for (const t of tables) {
      const res = await safeQuery.executeQuery(`SELECT COUNT(*)::integer as c FROM ${t}`);
      finalCounts[t] = res[0].c;
      if (finalCounts[t] !== initialCounts[t]) countsIntact = false;
    }
    console.log('\nDatabase row count integrity intact:', countsIntact);
    if (!countsIntact) {
      console.error('ROW COUNT MISMATCH DETECTED!');
    }

  } catch (error: any) {
    console.error('Verification failed:', error.message);
  } finally {
    await app.close();
  }
}

verify();
