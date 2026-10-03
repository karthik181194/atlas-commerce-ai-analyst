// Reusable SQL fragments for deterministic accounting rules.

export const SqlFragments = {
  // CTE for gross sales within a date range
  grossSalesCTE(startDateVar: string, endDateVar: string, suffix: string = '') {
    return `
      gross_sales${suffix} AS (
        SELECT 
          o.order_id,
          o.order_date,
          o.customer_id,
          o.region_id,
          o.segment_at_order,
          oi.product_id,
          oi.quantity,
          oi.unit_price_at_purchase,
          p.product_name,
          p.category_id,
          pc.category_name
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN products p ON oi.product_id = p.product_id
        JOIN product_categories pc ON p.category_id = pc.category_id
        WHERE o.order_status = 'completed'
          AND o.order_date >= ${startDateVar} AND o.order_date <= ${endDateVar}
      )
    `;
  },

  // CTE for refunds processed within a date range
  refundsCTE(startDateVar: string, endDateVar: string, suffix: string = '') {
    return `
      refunds${suffix} AS (
        SELECT 
          r.return_id,
          r.processed_date,
          r.refund_amount,
          oi.product_id,
          o.region_id,
          o.segment_at_order,
          p.category_id,
          pc.category_name
        FROM returns r
        JOIN order_items oi ON r.order_item_id = oi.order_item_id
        JOIN orders o ON oi.order_id = o.order_id
        JOIN products p ON oi.product_id = p.product_id
        JOIN product_categories pc ON p.category_id = pc.category_id
        WHERE r.processed_date >= ${startDateVar} AND r.processed_date <= ${endDateVar}
      )
    `;
  },
  
  // A helper macro for percentage calculation safely
  safePercentageChange(current: string, previous: string) {
    // Explicitly cast to numeric to prevent PostgreSQL integer division (e.g. 4314 / 12822 = 0)
    return `
      CASE 
        WHEN (${previous})::numeric = 0 THEN NULL
        ELSE (((${current})::numeric - (${previous})::numeric) / (${previous})::numeric * 100.0)::numeric(10,2)
      END
    `;
  }
};
