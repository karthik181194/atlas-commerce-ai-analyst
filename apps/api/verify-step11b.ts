import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AnalyticsService } from './src/analytics/analytics.service';
import { SafeQueryService } from './src/analytics/safe-query.service';
import { Pool } from 'pg';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const analytics = app.get(AnalyticsService);
  const safeQuery = app.get(SafeQueryService);
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/atlas_commerce',
  });

  const getCount = async (table: string) => {
    const res = await pool.query(`SELECT COUNT(*) FROM ${table}`);
    return parseInt(res.rows[0].count, 10);
  };

  const aug = { startDate: '2025-08-01', endDate: '2025-08-31' };
  const comp = { currentStartDate: '2025-08-01', currentEndDate: '2025-08-31', comparisonStartDate: '2025-07-01', comparisonEndDate: '2025-07-31' };

  try {
    console.log('--- VERIFICATION: Initial Row Counts ---');
    console.log('customers:', await getCount('customers'));
    console.log('products:', await getCount('products'));
    console.log('orders:', await getCount('orders'));
    console.log('order_items:', await getCount('order_items'));
    console.log('returns:', await getCount('returns'));
    console.log('inventory_events:', await getCount('inventory_events'));

    console.log('\n--- 1. revenue_by_period (Aug 2025) ---');
    console.log(await analytics.revenueByPeriod(aug));

    console.log('\n--- 2. revenue_by_region (Aug 2025) ---');
    console.log(await analytics.revenueByRegion(aug));

    console.log('\n--- 3. revenue_by_category (Aug 2025) ---');
    console.log(await analytics.revenueByCategory(aug));

    console.log('\n--- 4. revenue_by_product (Aug 2025) ---');
    console.log(await analytics.revenueByProduct(aug, 5));

    console.log('\n--- 5. revenue_by_segment (Aug 2025) ---');
    console.log(await analytics.revenueBySegment(aug));

    console.log('\n--- 6. orders_by_period (Aug 2025) ---');
    console.log(await analytics.ordersByPeriod(aug));

    console.log('\n--- 7. returns_by_period (Aug 2025) ---');
    console.log(await analytics.returnsByPeriod(aug));

    console.log('\n--- 8. revenue_period_comparison (Aug vs Jul 2025) ---');
    console.log(await analytics.revenuePeriodComparison(comp));

    console.log('\n--- 9. revenue_by_region_comparison (Aug vs Jul 2025) ---');
    console.log(await analytics.revenueByRegionComparison(comp));

    console.log('\n--- 10. revenue_by_category_comparison (Aug vs Jul 2025) ---');
    console.log(await analytics.revenueByCategoryComparison(comp));

    console.log('\n--- 11. top_products (Aug 2025) ---');
    console.log(await analytics.topProducts(aug, 10));

    console.log('\n--- 12. customer_activity_summary (Aug 2025) ---');
    console.log(await analytics.customerActivitySummary(aug));

    console.log('\n--- 13. segment_order_distribution (Aug 2025) ---');
    console.log(await analytics.segmentOrderDistribution(aug));

    console.log('\n--- 14. category_return_metrics (Aug 2025) ---');
    console.log(await analytics.categoryReturnMetrics(aug));

    console.log('\n--- VERIFICATION: Safety Checks ---');
    let safetyPassed = true;
    try {
      await safeQuery.executeQuery("INSERT INTO dataset_metadata (as_of_date) VALUES ('2025-10-01')");
      safetyPassed = false;
    } catch (e: any) {
      console.log('INSERT safely rejected:', e.message);
    }
    
    try {
      await safeQuery.executeQuery("SELECT 1; UPDATE dataset_metadata SET as_of_date = '2025-10-01'");
      safetyPassed = false;
    } catch (e: any) {
      console.log('UPDATE via multiple statements safely rejected:', e.message);
    }

    if (!safetyPassed) {
      console.error('SAFETY VERIFICATION FAILED');
    } else {
      console.log('Safety checks PASSED');
    }

    console.log('\n--- VERIFICATION: Final Row Counts ---');
    console.log('customers:', await getCount('customers'));
    console.log('products:', await getCount('products'));
    console.log('orders:', await getCount('orders'));
    console.log('order_items:', await getCount('order_items'));
    console.log('returns:', await getCount('returns'));
    console.log('inventory_events:', await getCount('inventory_events'));

  } catch (error: any) {
    console.error('\nEXECUTION ERROR:', error.message);
  } finally {
    await pool.end();
    await app.close();
  }
}

bootstrap();
