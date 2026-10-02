import { Injectable } from '@nestjs/common';
import { SafeQueryService } from './safe-query.service';

export interface DateRange {
  startDate: string;
  endDate: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly queryService: SafeQueryService) {}

  async getRevenueByDateRange({ startDate, endDate }: DateRange) {
    const sql = `
      WITH gross_sales AS (
        SELECT 
          COUNT(DISTINCT o.order_id) as completed_orders,
          COALESCE(SUM(oi.quantity * oi.unit_price_at_purchase), 0) as gross_revenue
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        WHERE o.order_status = 'completed'
          AND o.order_date >= $1 AND o.order_date <= $2
      ),
      refunds AS (
        SELECT 
          COALESCE(SUM(r.refund_amount), 0) as total_refunds
        FROM returns r
        WHERE r.processed_date >= $1 AND r.processed_date <= $2
      )
      SELECT 
        g.completed_orders::integer as "completedOrders",
        g.gross_revenue::numeric as "grossRevenue",
        r.total_refunds::numeric as "refunds",
        (g.gross_revenue - r.total_refunds)::numeric as "netRevenue",
        CASE 
          WHEN g.completed_orders > 0 THEN ((g.gross_revenue - r.total_refunds) / g.completed_orders)::numeric 
          ELSE 0 
        END as "aov"
      FROM gross_sales g
      CROSS JOIN refunds r
    `;
    const rows = await this.queryService.executeQuery(sql, [startDate, endDate]);
    return rows[0];
  }

  async getRevenueByRegion({ startDate, endDate }: DateRange) {
    const sql = `
      WITH region_list AS (
        SELECT region_id, region_name FROM regions
      ),
      gross_sales AS (
        SELECT 
          o.region_id,
          COUNT(DISTINCT o.order_id) as completed_orders,
          COALESCE(SUM(oi.quantity * oi.unit_price_at_purchase), 0) as gross_revenue
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        WHERE o.order_status = 'completed'
          AND o.order_date >= $1 AND o.order_date <= $2
        GROUP BY o.region_id
      ),
      refunds AS (
        SELECT 
          o.region_id,
          COALESCE(SUM(r.refund_amount), 0) as total_refunds
        FROM returns r
        JOIN order_items oi ON r.order_item_id = oi.order_item_id
        JOIN orders o ON oi.order_id = o.order_id
        WHERE r.processed_date >= $1 AND r.processed_date <= $2
        GROUP BY o.region_id
      )
      SELECT 
        rl.region_name as "region",
        COALESCE(g.completed_orders, 0)::integer as "completedOrders",
        (COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0))::numeric as "netRevenue",
        CASE 
          WHEN COALESCE(g.completed_orders, 0) > 0 
          THEN ((COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0)) / g.completed_orders)::numeric 
          ELSE 0 
        END as "aov"
      FROM region_list rl
      LEFT JOIN gross_sales g ON rl.region_id = g.region_id
      LEFT JOIN refunds r ON rl.region_id = r.region_id
      ORDER BY "netRevenue" DESC
    `;
    return this.queryService.executeQuery(sql, [startDate, endDate]);
  }

  async getRevenueByCategoryAndProduct({ startDate, endDate }: DateRange) {
    const sql = `
      WITH gross_sales AS (
        SELECT 
          p.product_id,
          p.product_name,
          pc.category_name,
          COUNT(DISTINCT o.order_id) as completed_orders,
          COALESCE(SUM(oi.quantity * oi.unit_price_at_purchase), 0) as gross_revenue
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN products p ON oi.product_id = p.product_id
        JOIN product_categories pc ON p.category_id = pc.category_id
        WHERE o.order_status = 'completed'
          AND o.order_date >= $1 AND o.order_date <= $2
        GROUP BY p.product_id, p.product_name, pc.category_name
      ),
      refunds AS (
        SELECT 
          oi.product_id,
          COALESCE(SUM(r.refund_amount), 0) as total_refunds
        FROM returns r
        JOIN order_items oi ON r.order_item_id = oi.order_item_id
        WHERE r.processed_date >= $1 AND r.processed_date <= $2
        GROUP BY oi.product_id
      )
      SELECT
        g.category_name as "category",
        g.product_name as "product",
        g.completed_orders::integer as "completedOrders",
        (g.gross_revenue - COALESCE(r.total_refunds, 0))::numeric as "netRevenue"
      FROM gross_sales g
      LEFT JOIN refunds r ON g.product_id = r.product_id
      ORDER BY "netRevenue" DESC
    `;
    return this.queryService.executeQuery(sql, [startDate, endDate]);
  }

  async getRevenueBySegment({ startDate, endDate }: DateRange) {
    const sql = `
      WITH segment_list AS (
        SELECT segment_id, segment_name FROM customer_segments
      ),
      gross_sales AS (
        SELECT 
          o.segment_at_order as segment_id,
          COUNT(DISTINCT o.order_id) as completed_orders,
          COALESCE(SUM(oi.quantity * oi.unit_price_at_purchase), 0) as gross_revenue
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        WHERE o.order_status = 'completed'
          AND o.order_date >= $1 AND o.order_date <= $2
        GROUP BY o.segment_at_order
      ),
      refunds AS (
        SELECT 
          o.segment_at_order as segment_id,
          COALESCE(SUM(r.refund_amount), 0) as total_refunds
        FROM returns r
        JOIN order_items oi ON r.order_item_id = oi.order_item_id
        JOIN orders o ON oi.order_id = o.order_id
        WHERE r.processed_date >= $1 AND r.processed_date <= $2
        GROUP BY o.segment_at_order
      )
      SELECT 
        sl.segment_name as "segment",
        COALESCE(g.completed_orders, 0)::integer as "completedOrders",
        (COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0))::numeric as "netRevenue",
        CASE 
          WHEN COALESCE(g.completed_orders, 0) > 0 
          THEN ((COALESCE(g.gross_revenue, 0) - COALESCE(r.total_refunds, 0)) / g.completed_orders)::numeric 
          ELSE 0 
        END as "aov"
      FROM segment_list sl
      LEFT JOIN gross_sales g ON sl.segment_id = g.segment_id
      LEFT JOIN refunds r ON sl.segment_id = r.segment_id
      ORDER BY "netRevenue" DESC
    `;
    return this.queryService.executeQuery(sql, [startDate, endDate]);
  }

  async getReturnMetrics({ startDate, endDate }: DateRange) {
    const sql = `
      WITH return_stats AS (
        SELECT 
          COUNT(r.return_id) as return_count,
          COALESCE(SUM(r.refund_amount), 0) as refund_amount
        FROM returns r
        WHERE r.processed_date >= $1 AND r.processed_date <= $2
      ),
      order_stats AS (
        SELECT COUNT(DISTINCT o.order_id) as order_count
        FROM orders o
        WHERE o.order_date >= $1 AND o.order_date <= $2
          AND o.order_status = 'completed'
      )
      SELECT 
        rs.return_count::integer as "returnCount",
        rs.refund_amount::numeric as "refundAmount",
        CASE 
          WHEN os.order_count > 0 THEN (rs.return_count::numeric / os.order_count)
          ELSE 0 
        END::numeric as "returnRate"
      FROM return_stats rs
      CROSS JOIN order_stats os
    `;
    const rows = await this.queryService.executeQuery(sql, [startDate, endDate]);
    return rows[0];
  }

  async getTopProducts({ startDate, endDate }: DateRange, limit: number = 10) {
    const sql = `
      WITH gross_sales AS (
        SELECT 
          p.product_id,
          p.product_name,
          pc.category_name,
          SUM(oi.quantity) as units_sold,
          COALESCE(SUM(oi.quantity * oi.unit_price_at_purchase), 0) as gross_revenue
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN products p ON oi.product_id = p.product_id
        JOIN product_categories pc ON p.category_id = pc.category_id
        WHERE o.order_status = 'completed'
          AND o.order_date >= $1 AND o.order_date <= $2
        GROUP BY p.product_id, p.product_name, pc.category_name
      ),
      refunds AS (
        SELECT 
          oi.product_id,
          COALESCE(SUM(r.refund_amount), 0) as total_refunds
        FROM returns r
        JOIN order_items oi ON r.order_item_id = oi.order_item_id
        WHERE r.processed_date >= $1 AND r.processed_date <= $2
        GROUP BY oi.product_id
      )
      SELECT 
        g.product_name as "product",
        g.category_name as "category",
        g.units_sold::integer as "unitsSold",
        g.gross_revenue::numeric as "grossRevenue",
        COALESCE(r.total_refunds, 0)::numeric as "refundAmount",
        (g.gross_revenue - COALESCE(r.total_refunds, 0))::numeric as "netRevenue"
      FROM gross_sales g
      LEFT JOIN refunds r ON g.product_id = r.product_id
      ORDER BY "netRevenue" DESC
      LIMIT $3
    `;
    return this.queryService.executeQuery(sql, [startDate, endDate, limit]);
  }
}

