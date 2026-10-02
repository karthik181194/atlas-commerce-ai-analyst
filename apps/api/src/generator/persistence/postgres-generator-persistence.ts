import { Client } from 'pg';
import { ACTIVE_DATASET } from '../generator.config';
import { generateReferenceData } from '../reference-data/reference-data';
import { generateCustomers } from '../customers/customer-generator';
import { generateCampaignData } from '../campaigns/campaign-generator';
import { generateOrderData } from '../orders/order-generator';
import { generateReturnData } from '../returns/return-generator';
import { generateInventoryData } from '../inventory/inventory-generator';

export async function batchInsert(client: Client, tableName: string, columns: string[], data: any[][], batchSize = 2000) {
  for (let i = 0; i < data.length; i += batchSize) {
    const chunk = data.slice(i, i + batchSize);
    const values: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    for (const row of chunk) {
      const rowParams: string[] = [];
      for (const val of row) {
        params.push(val);
        rowParams.push(`$${paramIndex++}`);
      }
      values.push(`(${rowParams.join(', ')})`);
    }
    
    const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${values.join(', ')}`;
    await client.query(query, params);
  }
}

export async function persistDatasetToPostgres(seed: number = ACTIVE_DATASET.seed) {
  const ref = generateReferenceData(seed);
  const customers = generateCustomers(seed);
  const campaignData = generateCampaignData(seed);
  const orderData = generateOrderData(seed);
  const returnData = generateReturnData(seed);
  const inventoryData = generateInventoryData(seed);

  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/atlas_commerce',
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    // 0. Safety Check: Ensure we are in atlas_commerce database
    const dbNameRes = await client.query('SELECT current_database()');
    const currentDb = dbNameRes.rows[0].current_database;
    if (currentDb !== 'atlas_commerce') {
      throw new Error(`Safety Check Failed: Expected database 'atlas_commerce', but connected to '${currentDb}'`);
    }

    // 1. Truncate all target tables safely (respects FKs due to CASCADE)
    await client.query(`
      TRUNCATE TABLE 
        inventory_events, 
        returns, 
        order_items, 
        orders, 
        campaign_spend, 
        marketing_campaigns, 
        products, 
        customers, 
        product_categories, 
        customer_segments, 
        regions, 
        warehouses, 
        dataset_metadata 
      RESTART IDENTITY CASCADE;
    `);

    // 2. Insert Dataset Metadata
    await client.query(`
      INSERT INTO dataset_metadata (key, value)
      VALUES 
        ('as_of_date', $1),
        ('dataset_start_date', $2),
        ('generated_at', CURRENT_TIMESTAMP::text)
    `, [ACTIVE_DATASET.asOfDate, ACTIVE_DATASET.datasetStartDate]);

    // 3. Insert Warehouses
    for (const w of ref.warehouses) {
      await client.query(`
        INSERT INTO warehouses (warehouse_id, warehouse_name)
        VALUES ($1, $2)
      `, [w.warehouseId, w.warehouseName]);
    }

    // 4. Insert Regions
    for (const r of ref.regions) {
      await client.query(`
        INSERT INTO regions (region_id, region_name, default_warehouse_id)
        VALUES ($1, $2, $3)
      `, [r.regionId, r.regionName, r.defaultWarehouseId]);
    }

    // 5. Insert Customer Segments
    for (const s of ref.customerSegments) {
      await client.query(`
        INSERT INTO customer_segments (segment_id, segment_name, description)
        VALUES ($1, $2, $3)
      `, [s.segmentId, s.segmentName, s.description]);
    }

    // 6. Insert Product Categories
    for (const pc of ref.productCategories) {
      await client.query(`
        INSERT INTO product_categories (category_id, category_name)
        VALUES ($1, $2)
      `, [pc.categoryId, pc.categoryName]);
    }

    // 7. Insert Customers
    await batchInsert(client, 'customers', 
      ['customer_id', 'first_name', 'last_name', 'email', 'region_id', 'segment_id', 'signup_date'], 
      customers.map(c => [c.customerId, c.firstName, c.lastName, c.email, c.regionId, c.segmentId, c.signupDate])
    );

    // 8. Insert Products
    await batchInsert(client, 'products', 
      ['product_id', 'product_name', 'category_id', 'unit_price', 'unit_cost', 'launch_date', 'is_active'], 
      ref.products.map(p => [p.productId, p.productName, p.categoryId, p.unitPrice, p.unitCost, p.launchDate, p.isActive])
    );

    // 9. Insert Marketing Campaigns
    await batchInsert(client, 'marketing_campaigns', 
      ['campaign_id', 'campaign_name', 'channel', 'target_segment_id', 'target_region_id', 'start_date', 'end_date', 'budget'], 
      campaignData.campaigns.map(mc => [mc.campaignId, mc.campaignName, mc.channel, mc.targetSegmentId, mc.targetRegionId, mc.startDate, mc.endDate, mc.budget])
    );

    // 10. Insert Campaign Spend
    await batchInsert(client, 'campaign_spend', 
      ['campaign_spend_id', 'campaign_id', 'spend_date', 'amount'], 
      campaignData.campaignSpend.map(cs => [cs.campaignSpendId, cs.campaignId, cs.spendDate, cs.amount])
    );

    // 11. Insert Orders
    await batchInsert(client, 'orders', 
      ['order_id', 'customer_id', 'region_id', 'fulfilling_warehouse_id', 'campaign_id', 'segment_at_order', 'order_date', 'order_status', 'total_amount'], 
      orderData.orders.map(o => [o.orderId, o.customerId, o.regionId, o.fulfillingWarehouseId, o.campaignId, o.segmentAtOrder, o.orderDate, o.orderStatus, o.totalAmount])
    );

    // 12. Insert Order Items
    await batchInsert(client, 'order_items', 
      ['order_item_id', 'order_id', 'product_id', 'quantity', 'unit_price_at_purchase'], 
      orderData.orderItems.map(oi => [oi.orderItemId, oi.orderId, oi.productId, oi.quantity, oi.unitPriceAtPurchase])
    );

    // 13. Insert Returns
    await batchInsert(client, 'returns', 
      ['return_id', 'order_item_id', 'return_date', 'processed_date', 'reason', 'refund_amount'], 
      returnData.returns.map(ret => [ret.returnId, ret.orderItemId, ret.returnDate, ret.processedDate, ret.reason, ret.refundAmount])
    );

    // 14. Insert Inventory Events
    await batchInsert(client, 'inventory_events', 
      ['inventory_event_id', 'product_id', 'warehouse_id', 'event_date', 'event_type', 'stock_level_after'], 
      inventoryData.inventoryEvents.map(ie => [ie.inventoryEventId, ie.productId, ie.warehouseId, ie.eventDate, ie.eventType, ie.stockLevelAfter])
    );

    // Reset sequences since we inserted explicitly (useful if someone does manual inserts later)
    const tablesWithSeq = [
      { t: 'warehouses', pk: 'warehouse_id' },
      { t: 'regions', pk: 'region_id' },
      { t: 'customer_segments', pk: 'segment_id' },
      { t: 'product_categories', pk: 'category_id' },
      { t: 'customers', pk: 'customer_id' },
      { t: 'products', pk: 'product_id' },
      { t: 'marketing_campaigns', pk: 'campaign_id' },
      { t: 'campaign_spend', pk: 'campaign_spend_id' },
      { t: 'orders', pk: 'order_id' },
      { t: 'order_items', pk: 'order_item_id' },
      { t: 'returns', pk: 'return_id' },
      { t: 'inventory_events', pk: 'inventory_event_id' }
    ];

    for (const { t, pk } of tablesWithSeq) {
      await client.query(`
        SELECT setval('${t}_${pk}_seq', COALESCE((SELECT MAX(${pk}) FROM ${t}), 1), true);
      `);
    }

    await client.query('COMMIT');
    return {
      success: true,
      counts: {
        warehouses: ref.warehouses.length,
        regions: ref.regions.length,
        customerSegments: ref.customerSegments.length,
        productCategories: ref.productCategories.length,
        customers: customers.length,
        products: ref.products.length,
        marketingCampaigns: campaignData.campaigns.length,
        campaignSpend: campaignData.campaignSpend.length,
        orders: orderData.orders.length,
        orderItems: orderData.orderItems.length,
        returns: returnData.returns.length,
        inventoryEvents: inventoryData.inventoryEvents.length
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
