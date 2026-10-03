import { Injectable } from '@nestjs/common';
import { SafeQueryService } from './safe-query.service';
import * as T from './analytics.types';
import { SqlFragments } from './analytics.sql';

@Injectable()
export class AnalyticsService {
  constructor(private readonly queryService: SafeQueryService) {}

  // 1. revenue_by_period
  async revenueByPeriod({ startDate, endDate }: T.DateRange): Promise<T.RevenueResult> {
    const sql = `
      WITH ${SqlFragments.grossSalesCTE('$1', '$2')},
           ${SqlFragments.refundsCTE('$1', '$2')}
      SELECT 
        COALESCE(SUM(g.quantity * g.unit_price_at_purchase), 0)::numeric as "grossRevenue",
        COALESCE((SELECT SUM(refund_amount) FROM refunds), 0)::numeric as "refunds",
        (COALESCE(SUM(g.quantity * g.unit_price_at_purchase), 0) - COALESCE((SELECT SUM(refund_amount) FROM refunds), 0))::numeric as "netRevenue",
        COUNT(DISTINCT g.order_id)::integer as "completedOrders",
        CASE 
          WHEN COUNT(DISTINCT g.order_id) > 0 THEN 
            ((COALESCE(SUM(g.quantity * g.unit_price_at_purchase), 0) - COALESCE((SELECT SUM(refund_amount) FROM refunds), 0)) / COUNT(DISTINCT g.order_id))::numeric
          ELSE 0 
        END as "aov"
      FROM gross_sales g
    `;
    const rows = await this.queryService.executeQuery(sql, [startDate, endDate]);
    return rows[0] || { grossRevenue: '0', refunds: '0', netRevenue: '0', completedOrders: 0, aov: '0' };
  }

  // 2. revenue_by_region
  async revenueByRegion({ startDate, endDate }: T.DateRange): Promise<T.RegionRevenueResult[]> {
    const sql = `
      WITH ${SqlFragments.grossSalesCTE('$1', '$2')},
           ${SqlFragments.refundsCTE('$1', '$2')},
      region_list AS (SELECT region_id, region_name FROM regions),
      g_agg AS (
        SELECT region_id, COUNT(DISTINCT order_id) as completed_orders, COALESCE(SUM(quantity * unit_price_at_purchase), 0) as gross_revenue
        FROM gross_sales GROUP BY region_id
      ),
      r_agg AS (
        SELECT region_id, COALESCE(SUM(refund_amount), 0) as total_refunds
        FROM refunds GROUP BY region_id
      )
      SELECT 
        rl.region_name as "region",
        COALESCE(g.gross_revenue, 0)::numeric as "grossRevenue",
        COALESCE(r.total_refunds, 0)::numeric as "refunds",
        (COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0))::numeric as "netRevenue",
        COALESCE(g.completed_orders, 0)::integer as "completedOrders",
        CASE WHEN COALESCE(g.completed_orders, 0) > 0 THEN ((COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0)) / g.completed_orders)::numeric ELSE 0 END as "aov"
      FROM region_list rl
      LEFT JOIN g_agg g ON rl.region_id = g.region_id
      LEFT JOIN r_agg r ON rl.region_id = r.region_id
      ORDER BY "netRevenue" DESC
    `;
    return this.queryService.executeQuery(sql, [startDate, endDate]);
  }

  // 3. revenue_by_category
  async revenueByCategory({ startDate, endDate }: T.DateRange): Promise<T.CategoryRevenueResult[]> {
    const sql = `
      WITH ${SqlFragments.grossSalesCTE('$1', '$2')},
           ${SqlFragments.refundsCTE('$1', '$2')},
      cat_list AS (SELECT category_id, category_name FROM product_categories),
      g_agg AS (
        SELECT category_id, COUNT(DISTINCT order_id) as completed_orders, SUM(quantity) as units_sold, COALESCE(SUM(quantity * unit_price_at_purchase), 0) as gross_revenue
        FROM gross_sales GROUP BY category_id
      ),
      r_agg AS (
        SELECT category_id, COALESCE(SUM(refund_amount), 0) as total_refunds
        FROM refunds GROUP BY category_id
      )
      SELECT 
        cl.category_name as "category",
        COALESCE(g.gross_revenue, 0)::numeric as "grossRevenue",
        COALESCE(r.total_refunds, 0)::numeric as "refunds",
        (COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0))::numeric as "netRevenue",
        COALESCE(g.completed_orders, 0)::integer as "completedOrders",
        COALESCE(g.units_sold, 0)::integer as "unitsSold",
        CASE WHEN COALESCE(g.completed_orders, 0) > 0 THEN ((COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0)) / g.completed_orders)::numeric ELSE 0 END as "aov"
      FROM cat_list cl
      LEFT JOIN g_agg g ON cl.category_id = g.category_id
      LEFT JOIN r_agg r ON cl.category_id = r.category_id
      ORDER BY "netRevenue" DESC
    `;
    return this.queryService.executeQuery(sql, [startDate, endDate]);
  }

  // 4. revenue_by_product
  async revenueByProduct({ startDate, endDate }: T.DateRange, limit?: number): Promise<T.ProductRevenueResult[]> {
    const sql = `
      WITH ${SqlFragments.grossSalesCTE('$1', '$2')},
           ${SqlFragments.refundsCTE('$1', '$2')},
      g_agg AS (
        SELECT product_id, product_name, category_name, COUNT(DISTINCT order_id) as completed_orders, SUM(quantity) as units_sold, COALESCE(SUM(quantity * unit_price_at_purchase), 0) as gross_revenue
        FROM gross_sales GROUP BY product_id, product_name, category_name
      ),
      r_agg AS (
        SELECT product_id, COALESCE(SUM(refund_amount), 0) as total_refunds
        FROM refunds GROUP BY product_id
      )
      SELECT 
        g.product_name as "product",
        g.category_name as "category",
        g.gross_revenue::numeric as "grossRevenue",
        COALESCE(r.total_refunds, 0)::numeric as "refunds",
        (g.gross_revenue - COALESCE(r.total_refunds, 0))::numeric as "netRevenue",
        g.completed_orders::integer as "completedOrders",
        g.units_sold::integer as "unitsSold",
        CASE WHEN g.completed_orders > 0 THEN ((g.gross_revenue - COALESCE(r.total_refunds, 0)) / g.completed_orders)::numeric ELSE 0 END as "aov"
      FROM g_agg g
      LEFT JOIN r_agg r ON g.product_id = r.product_id
      ORDER BY "netRevenue" DESC
      ${limit ? 'LIMIT $3' : ''}
    `;
    const params = limit ? [startDate, endDate, limit] : [startDate, endDate];
    return this.queryService.executeQuery(sql, params);
  }

  // 5. revenue_by_segment
  async revenueBySegment({ startDate, endDate }: T.DateRange): Promise<T.SegmentRevenueResult[]> {
    const sql = `
      WITH ${SqlFragments.grossSalesCTE('$1', '$2')},
           ${SqlFragments.refundsCTE('$1', '$2')},
      seg_list AS (SELECT segment_id, segment_name FROM customer_segments),
      g_agg AS (
        SELECT segment_at_order, COUNT(DISTINCT order_id) as completed_orders, COALESCE(SUM(quantity * unit_price_at_purchase), 0) as gross_revenue
        FROM gross_sales GROUP BY segment_at_order
      ),
      r_agg AS (
        SELECT segment_at_order, COALESCE(SUM(refund_amount), 0) as total_refunds
        FROM refunds GROUP BY segment_at_order
      )
      SELECT 
        sl.segment_name as "segment",
        COALESCE(g.gross_revenue, 0)::numeric as "grossRevenue",
        COALESCE(r.total_refunds, 0)::numeric as "refunds",
        (COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0))::numeric as "netRevenue",
        COALESCE(g.completed_orders, 0)::integer as "completedOrders",
        CASE WHEN COALESCE(g.completed_orders, 0) > 0 THEN ((COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0)) / g.completed_orders)::numeric ELSE 0 END as "aov"
      FROM seg_list sl
      LEFT JOIN g_agg g ON sl.segment_id = g.segment_at_order
      LEFT JOIN r_agg r ON sl.segment_id = r.segment_at_order
      ORDER BY "netRevenue" DESC
    `;
    return this.queryService.executeQuery(sql, [startDate, endDate]);
  }

  // 6. orders_by_period
  async ordersByPeriod({ startDate, endDate }: T.DateRange): Promise<T.OrderPeriodResult> {
    const sql = `
      SELECT 
        COUNT(CASE WHEN order_status = 'completed' THEN 1 END)::integer as "completedOrders",
        COUNT(CASE WHEN order_status = 'cancelled' THEN 1 END)::integer as "cancelledOrders",
        COUNT(*)::integer as "totalOrders"
      FROM orders
      WHERE order_date >= $1 AND order_date <= $2
    `;
    const rows = await this.queryService.executeQuery(sql, [startDate, endDate]);
    return rows[0];
  }

  // 7. returns_by_period
  async returnsByPeriod({ startDate, endDate }: T.DateRange): Promise<T.ReturnMetricsResult> {
    const sql = `
      WITH return_stats AS (
        SELECT COUNT(return_id) as return_count, COALESCE(SUM(refund_amount), 0) as refund_amount
        FROM returns WHERE processed_date >= $1 AND processed_date <= $2
      ),
      order_stats AS (
        SELECT COUNT(DISTINCT order_id) as order_count
        FROM orders WHERE order_date >= $1 AND order_date <= $2 AND order_status = 'completed'
      )
      SELECT 
        rs.return_count::integer as "returnCount",
        rs.refund_amount::numeric as "refundAmount",
        CASE WHEN os.order_count > 0 THEN (rs.return_count::numeric / os.order_count)::numeric(10,4) ELSE NULL END::text as "returnRate"
      FROM return_stats rs
      CROSS JOIN order_stats os
    `;
    const rows = await this.queryService.executeQuery(sql, [startDate, endDate]);
    return rows[0];
  }

  // 8. revenue_period_comparison
  async revenuePeriodComparison(params: T.ComparisonDateRange): Promise<T.RevenueComparisonResult> {
    const sql = `
      WITH ${SqlFragments.grossSalesCTE('$1', '$2', '_curr')},
           ${SqlFragments.refundsCTE('$1', '$2', '_curr')},
           ${SqlFragments.grossSalesCTE('$3', '$4', '_comp')},
           ${SqlFragments.refundsCTE('$3', '$4', '_comp')},
      curr_agg AS (
        SELECT 
          (COALESCE(SUM(g.quantity * g.unit_price_at_purchase), 0) - COALESCE((SELECT SUM(refund_amount) FROM refunds_curr), 0)) as net_rev,
          COUNT(DISTINCT g.order_id) as orders,
          CASE WHEN COUNT(DISTINCT g.order_id) > 0 THEN (COALESCE(SUM(g.quantity * g.unit_price_at_purchase), 0) - COALESCE((SELECT SUM(refund_amount) FROM refunds_curr), 0)) / COUNT(DISTINCT g.order_id) ELSE 0 END as aov
        FROM gross_sales_curr g
      ),
      comp_agg AS (
        SELECT 
          (COALESCE(SUM(g.quantity * g.unit_price_at_purchase), 0) - COALESCE((SELECT SUM(refund_amount) FROM refunds_comp), 0)) as net_rev,
          COUNT(DISTINCT g.order_id) as orders,
          CASE WHEN COUNT(DISTINCT g.order_id) > 0 THEN (COALESCE(SUM(g.quantity * g.unit_price_at_purchase), 0) - COALESCE((SELECT SUM(refund_amount) FROM refunds_comp), 0)) / COUNT(DISTINCT g.order_id) ELSE 0 END as aov
        FROM gross_sales_comp g
      )
      SELECT 
        COALESCE(c.net_rev, 0)::numeric as "currentNetRevenue",
        COALESCE(p.net_rev, 0)::numeric as "comparisonNetRevenue",
        (COALESCE(c.net_rev, 0) - COALESCE(p.net_rev, 0))::numeric as "absoluteChange",
        ${SqlFragments.safePercentageChange('COALESCE(c.net_rev, 0)', 'COALESCE(p.net_rev, 0)')}::text as "percentageChange",
        COALESCE(c.orders, 0)::integer as "currentCompletedOrders",
        COALESCE(p.orders, 0)::integer as "comparisonCompletedOrders",
        ${SqlFragments.safePercentageChange('COALESCE(c.orders, 0)', 'COALESCE(p.orders, 0)')}::text as "orderChangePercentage",
        COALESCE(c.aov, 0)::numeric as "currentAov",
        COALESCE(p.aov, 0)::numeric as "comparisonAov",
        ${SqlFragments.safePercentageChange('COALESCE(c.aov, 0)', 'COALESCE(p.aov, 0)')}::text as "aovChangePercentage"
      FROM curr_agg c CROSS JOIN comp_agg p
    `;
    const rows = await this.queryService.executeQuery(sql, [params.currentStartDate, params.currentEndDate, params.comparisonStartDate, params.comparisonEndDate]);
    return rows[0];
  }

  // 9. revenue_by_region_comparison
  async revenueByRegionComparison(params: T.ComparisonDateRange): Promise<T.RegionRevenueComparisonResult[]> {
    const sql = `
      WITH ${SqlFragments.grossSalesCTE('$1', '$2', '_curr')},
           ${SqlFragments.refundsCTE('$1', '$2', '_curr')},
           ${SqlFragments.grossSalesCTE('$3', '$4', '_comp')},
           ${SqlFragments.refundsCTE('$3', '$4', '_comp')},
      region_list AS (SELECT region_id, region_name FROM regions),
      c_g AS (SELECT region_id, COUNT(DISTINCT order_id) as orders, COALESCE(SUM(quantity * unit_price_at_purchase), 0) as gross FROM gross_sales_curr GROUP BY region_id),
      c_r AS (SELECT region_id, COALESCE(SUM(refund_amount), 0) as refs FROM refunds_curr GROUP BY region_id),
      p_g AS (SELECT region_id, COUNT(DISTINCT order_id) as orders, COALESCE(SUM(quantity * unit_price_at_purchase), 0) as gross FROM gross_sales_comp GROUP BY region_id),
      p_r AS (SELECT region_id, COALESCE(SUM(refund_amount), 0) as refs FROM refunds_comp GROUP BY region_id)
      SELECT 
        rl.region_name as "region",
        (COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0))::numeric as "currentNetRevenue",
        (COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0))::numeric as "comparisonNetRevenue",
        ((COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0)) - (COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0)))::numeric as "absoluteChange",
        ${SqlFragments.safePercentageChange('(COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0))', '(COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0))')}::text as "percentageChange",
        COALESCE(c_g.orders, 0)::integer as "currentCompletedOrders",
        COALESCE(p_g.orders, 0)::integer as "comparisonCompletedOrders",
        ${SqlFragments.safePercentageChange('COALESCE(c_g.orders, 0)', 'COALESCE(p_g.orders, 0)')}::text as "orderChangePercentage",
        CASE WHEN COALESCE(c_g.orders, 0) > 0 THEN ((COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0)) / c_g.orders)::numeric ELSE 0 END as "currentAov",
        CASE WHEN COALESCE(p_g.orders, 0) > 0 THEN ((COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0)) / p_g.orders)::numeric ELSE 0 END as "comparisonAov",
        ${SqlFragments.safePercentageChange('CASE WHEN COALESCE(c_g.orders, 0) > 0 THEN ((COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0)) / c_g.orders) ELSE 0 END', 'CASE WHEN COALESCE(p_g.orders, 0) > 0 THEN ((COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0)) / p_g.orders) ELSE 0 END')}::text as "aovChangePercentage"
      FROM region_list rl
      LEFT JOIN c_g ON rl.region_id = c_g.region_id
      LEFT JOIN c_r ON rl.region_id = c_r.region_id
      LEFT JOIN p_g ON rl.region_id = p_g.region_id
      LEFT JOIN p_r ON rl.region_id = p_r.region_id
      ORDER BY "currentNetRevenue" DESC
    `;
    return this.queryService.executeQuery(sql, [params.currentStartDate, params.currentEndDate, params.comparisonStartDate, params.comparisonEndDate]);
  }

  // 10. revenue_by_category_comparison
  async revenueByCategoryComparison(params: T.ComparisonDateRange): Promise<T.CategoryRevenueComparisonResult[]> {
    const sql = `
      WITH ${SqlFragments.grossSalesCTE('$1', '$2', '_curr')},
           ${SqlFragments.refundsCTE('$1', '$2', '_curr')},
           ${SqlFragments.grossSalesCTE('$3', '$4', '_comp')},
           ${SqlFragments.refundsCTE('$3', '$4', '_comp')},
      cat_list AS (SELECT category_id, category_name FROM product_categories),
      c_g AS (SELECT category_id, COUNT(DISTINCT order_id) as orders, COALESCE(SUM(quantity * unit_price_at_purchase), 0) as gross FROM gross_sales_curr GROUP BY category_id),
      c_r AS (SELECT category_id, COALESCE(SUM(refund_amount), 0) as refs FROM refunds_curr GROUP BY category_id),
      p_g AS (SELECT category_id, COUNT(DISTINCT order_id) as orders, COALESCE(SUM(quantity * unit_price_at_purchase), 0) as gross FROM gross_sales_comp GROUP BY category_id),
      p_r AS (SELECT category_id, COALESCE(SUM(refund_amount), 0) as refs FROM refunds_comp GROUP BY category_id)
      SELECT 
        cl.category_name as "category",
        (COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0))::numeric as "currentNetRevenue",
        (COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0))::numeric as "comparisonNetRevenue",
        ((COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0)) - (COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0)))::numeric as "absoluteChange",
        ${SqlFragments.safePercentageChange('(COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0))', '(COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0))')}::text as "percentageChange",
        COALESCE(c_g.orders, 0)::integer as "currentCompletedOrders",
        COALESCE(p_g.orders, 0)::integer as "comparisonCompletedOrders",
        ${SqlFragments.safePercentageChange('COALESCE(c_g.orders, 0)', 'COALESCE(p_g.orders, 0)')}::text as "orderChangePercentage",
        CASE WHEN COALESCE(c_g.orders, 0) > 0 THEN ((COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0)) / c_g.orders)::numeric ELSE 0 END as "currentAov",
        CASE WHEN COALESCE(p_g.orders, 0) > 0 THEN ((COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0)) / p_g.orders)::numeric ELSE 0 END as "comparisonAov",
        ${SqlFragments.safePercentageChange('CASE WHEN COALESCE(c_g.orders, 0) > 0 THEN ((COALESCE(c_g.gross, 0) - COALESCE(c_r.refs, 0)) / c_g.orders) ELSE 0 END', 'CASE WHEN COALESCE(p_g.orders, 0) > 0 THEN ((COALESCE(p_g.gross, 0) - COALESCE(p_r.refs, 0)) / p_g.orders) ELSE 0 END')}::text as "aovChangePercentage"
      FROM cat_list cl
      LEFT JOIN c_g ON cl.category_id = c_g.category_id
      LEFT JOIN c_r ON cl.category_id = c_r.category_id
      LEFT JOIN p_g ON cl.category_id = p_g.category_id
      LEFT JOIN p_r ON cl.category_id = p_r.category_id
      ORDER BY "currentNetRevenue" DESC
    `;
    return this.queryService.executeQuery(sql, [params.currentStartDate, params.currentEndDate, params.comparisonStartDate, params.comparisonEndDate]);
  }

  // 11. top_products
  async topProducts({ startDate, endDate }: T.DateRange, limit: number = 10): Promise<T.ProductRevenueResult[]> {
    return this.revenueByProduct({ startDate, endDate }, limit);
  }

  // 12. customer_activity_summary
  async customerActivitySummary({ startDate, endDate }: T.DateRange): Promise<T.CustomerActivitySummaryResult> {
    const sql = `
      WITH active_customers AS (
        SELECT customer_id, COUNT(DISTINCT order_id) as completed_orders
        FROM orders 
        WHERE order_date >= $1 AND order_date <= $2 AND order_status = 'completed'
        GROUP BY customer_id
      ),
      new_customers AS (
        SELECT customer_id FROM customers WHERE signup_date >= $1 AND signup_date <= $2
      )
      SELECT 
        COUNT(a.customer_id)::integer as "activeCustomers",
        COUNT(CASE WHEN n.customer_id IS NOT NULL THEN 1 END)::integer as "newCustomers",
        COUNT(CASE WHEN a.completed_orders > 1 THEN 1 END)::integer as "repeatCustomers",
        COALESCE(SUM(a.completed_orders), 0)::integer as "completedOrders",
        CASE WHEN COUNT(a.customer_id) > 0 THEN (COALESCE(SUM(a.completed_orders), 0)::numeric / COUNT(a.customer_id))::numeric(10,2) ELSE 0 END::numeric as "ordersPerActiveCustomer"
      FROM active_customers a
      LEFT JOIN new_customers n ON a.customer_id = n.customer_id
    `;
    const rows = await this.queryService.executeQuery(sql, [startDate, endDate]);
    return rows[0];
  }

  // 13. segment_order_distribution
  async segmentOrderDistribution({ startDate, endDate }: T.DateRange): Promise<T.SegmentOrderDistributionResult[]> {
    // Overlaps conceptually with revenueBySegment. We can just map it to the requested subset.
    const segments = await this.revenueBySegment({ startDate, endDate });
    return segments.map(s => ({
      segment: s.segment,
      completedOrders: s.completedOrders,
      netRevenue: s.netRevenue
    }));
  }

  // 14. category_return_metrics
  async categoryReturnMetrics({ startDate, endDate }: T.DateRange): Promise<T.CategoryReturnMetricsResult[]> {
    const sql = `
      WITH return_stats AS (
        SELECT 
          p.category_id,
          COUNT(r.return_id) as return_count,
          COALESCE(SUM(r.refund_amount), 0) as refund_amount
        FROM returns r
        JOIN order_items oi ON r.order_item_id = oi.order_item_id
        JOIN products p ON oi.product_id = p.product_id
        WHERE r.processed_date >= $1 AND r.processed_date <= $2
        GROUP BY p.category_id
      ),
      order_stats AS (
        SELECT 
          p.category_id,
          COUNT(DISTINCT o.order_id) as order_count
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN products p ON oi.product_id = p.product_id
        WHERE o.order_date >= $1 AND o.order_date <= $2 AND o.order_status = 'completed'
        GROUP BY p.category_id
      ),
      cat_list AS (SELECT category_id, category_name FROM product_categories)
      SELECT 
        cl.category_name as "category",
        COALESCE(rs.return_count, 0)::integer as "returnCount",
        COALESCE(rs.refund_amount, 0)::numeric as "refundAmount",
        CASE 
          WHEN COALESCE(os.order_count, 0) > 0 THEN (COALESCE(rs.return_count, 0)::numeric / os.order_count)::numeric(10,4)
          ELSE NULL 
        END::text as "returnRate"
      FROM cat_list cl
      LEFT JOIN return_stats rs ON cl.category_id = rs.category_id
      LEFT JOIN order_stats os ON cl.category_id = os.category_id
      ORDER BY "refundAmount" DESC
    `;
    return this.queryService.executeQuery(sql, [startDate, endDate]);
  }
}
