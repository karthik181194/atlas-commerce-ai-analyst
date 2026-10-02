import { persistDatasetToPostgres } from './persistence/postgres-generator-persistence';
import { Client } from 'pg';

async function verifyDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/atlas_commerce',
  });
  await client.connect();

  try {
    console.log('\n=======================================');
    console.log(' DATABASE VERIFICATION');
    console.log('=======================================');

    const counts: Record<string, number> = {};
    const tables = [
      'dataset_metadata', 'warehouses', 'regions', 'customer_segments',
      'product_categories', 'customers', 'products', 'marketing_campaigns',
      'campaign_spend', 'orders', 'order_items', 'returns', 'inventory_events'
    ];

    for (const t of tables) {
      const res = await client.query(`SELECT COUNT(*) FROM ${t}`);
      counts[t] = parseInt(res.rows[0].count, 10);
    }
    
    console.log('\nRow Counts:');
    console.table(counts);

    // Business event verification

    // 1. AquaFlow Blender
    const aqua = await client.query(`SELECT * FROM products WHERE product_name = 'AquaFlow Blender'`);
    console.log(`\nAquaFlow Blender exists: ${aqua.rows.length === 1 ? 'PASS' : 'FAIL'}`);

    // 2. Summer Loyalty Push
    const slp = await client.query(`SELECT * FROM marketing_campaigns WHERE campaign_name = 'Summer Loyalty Push'`);
    console.log(`Summer Loyalty Push exists: ${slp.rows.length === 1 ? 'PASS' : 'FAIL'}`);

    // 3. Mumbai Shortage
    const shortage = await client.query(`
      SELECT * FROM inventory_events ie
      JOIN warehouses w ON ie.warehouse_id = w.warehouse_id
      JOIN products p ON ie.product_id = p.product_id
      JOIN product_categories pc ON p.category_id = pc.category_id
      WHERE w.warehouse_name = 'Mumbai DC' 
        AND pc.category_name = 'Home Goods'
        AND ie.event_type = 'shortage_start'
    `);
    
    // Check if there are any Home Goods products in dev dataset
    const hgProducts = await client.query(`
      SELECT * FROM products p
      JOIN product_categories pc ON p.category_id = pc.category_id
      WHERE pc.category_name = 'Home Goods'
    `);

    if (hgProducts.rows.length === 0) {
      console.log(`Mumbai Shortage exists: N/A (no Home Goods products in dev config)`);
    } else {
      console.log(`Mumbai Shortage exists: ${shortage.rows.length > 0 ? 'PASS' : 'FAIL'}`);
    }

    // 4. Returns reference valid order items
    const invalidReturns = await client.query(`
      SELECT return_id FROM returns 
      WHERE order_item_id NOT IN (SELECT order_item_id FROM order_items)
    `);
    console.log(`Returns have valid order_items: ${invalidReturns.rows.length === 0 ? 'PASS' : 'FAIL'}`);

    // 5. No negative inventory stock
    const negStock = await client.query(`
      SELECT inventory_event_id FROM inventory_events WHERE stock_level_after < 0
    `);
    console.log(`No negative inventory stock: ${negStock.rows.length === 0 ? 'PASS' : 'FAIL'}`);

    // 6. Exactly one initial inventory event per product/warehouse
    const initialEvents = await client.query(`
      SELECT product_id, warehouse_id, COUNT(*) as c
      FROM inventory_events 
      WHERE event_type = 'initial_stock'
      GROUP BY product_id, warehouse_id
      HAVING COUNT(*) <> 1
    `);
    console.log(`One initial stock per product/warehouse: ${initialEvents.rows.length === 0 ? 'PASS' : 'FAIL'}`);

    // 7. No orphaned records (FK verification beyond Returns)
    let orphanedCount = 0;
    
    // orders -> customers
    const badOrders = await client.query(`SELECT order_id FROM orders WHERE customer_id NOT IN (SELECT customer_id FROM customers)`);
    orphanedCount += badOrders.rows.length;
    
    // order_items -> products
    const badItems = await client.query(`SELECT order_item_id FROM order_items WHERE product_id NOT IN (SELECT product_id FROM products)`);
    orphanedCount += badItems.rows.length;

    // inventory_events -> products / warehouses
    const badInv = await client.query(`
      SELECT inventory_event_id FROM inventory_events 
      WHERE product_id NOT IN (SELECT product_id FROM products)
         OR warehouse_id NOT IN (SELECT warehouse_id FROM warehouses)
    `);
    orphanedCount += badInv.rows.length;

    // campaign_spend -> marketing_campaigns
    const badSpend = await client.query(`SELECT campaign_spend_id FROM campaign_spend WHERE campaign_id NOT IN (SELECT campaign_id FROM marketing_campaigns)`);
    orphanedCount += badSpend.rows.length;

    console.log(`No orphaned records (FKs valid): ${orphanedCount === 0 ? 'PASS' : 'FAIL'}`);

    // 8. Business Distribution Sanity Checks
    console.log('\n--- Business Distribution Sanity Checks ---');

    const regionDist = await client.query(`
      SELECT r.region_name, COUNT(*) * 100.0 / (SELECT COUNT(*) FROM customers) as pct
      FROM customers c
      JOIN regions r ON c.region_id = r.region_id
      GROUP BY r.region_name
      ORDER BY pct DESC
    `);
    console.log('\nRegion Distribution (Customers):');
    regionDist.rows.forEach(r => console.log(`  ${r.region_name}: ${parseFloat(r.pct).toFixed(1)}%`));

    const segmentDist = await client.query(`
      SELECT cs.segment_name, COUNT(*) * 100.0 / (SELECT COUNT(*) FROM customers) as pct
      FROM customers c
      JOIN customer_segments cs ON c.segment_id = cs.segment_id
      GROUP BY cs.segment_name
      ORDER BY pct DESC
    `);
    console.log('\nSegment Distribution (Customers):');
    segmentDist.rows.forEach(r => console.log(`  ${r.segment_name}: ${parseFloat(r.pct).toFixed(1)}%`));

    const productSkew = await client.query(`
      WITH product_sales AS (
        SELECT product_id, SUM(quantity) as total_qty
        FROM order_items
        GROUP BY product_id
      ),
      ranked_sales AS (
        SELECT product_id, total_qty, 
               PERCENT_RANK() OVER(ORDER BY total_qty DESC) as pct_rank
        FROM product_sales
      )
      SELECT SUM(total_qty) as top_10_qty,
             (SELECT SUM(total_qty) FROM product_sales) as total_qty
      FROM ranked_sales
      WHERE pct_rank <= 0.10
    `);
    if (productSkew.rows[0].total_qty > 0) {
      const top10Pct = (productSkew.rows[0].top_10_qty / productSkew.rows[0].total_qty) * 100;
      console.log(`\nProduct Popularity Skew: Top 10% products account for ${top10Pct.toFixed(1)}% of unit sales`);
    }

    const categoryMargins = await client.query(`
      SELECT pc.category_name, 
             AVG((p.unit_price - p.unit_cost) / p.unit_price) * 100 as avg_margin
      FROM products p
      JOIN product_categories pc ON p.category_id = pc.category_id
      GROUP BY pc.category_name
      ORDER BY avg_margin DESC
    `);
    console.log('\nCategory Margins:');
    categoryMargins.rows.forEach(r => console.log(`  ${r.category_name}: ${parseFloat(r.avg_margin).toFixed(1)}%`));

  } finally {
    await client.end();
  }
}

async function run() {
  try {
    console.log('Generating and persisting dataset to PostgreSQL...');
    const result = await persistDatasetToPostgres();
    console.log('Persistence successful!');
    
    await verifyDatabase();
  } catch (error) {
    console.error('Fatal error during database persistence:', error);
    process.exit(1);
  }
}

run();

