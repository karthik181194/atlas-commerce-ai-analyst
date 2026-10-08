import {
  ComparisonDateRange,
  DateRange,
} from './analytics.types';

/** Runtime source of truth for capabilities that accept DateRange params. */
export const DATE_RANGE_CAPABILITIES = [
  'revenue_by_period',
  'revenue_by_region',
  'revenue_by_category',
  'revenue_by_product',
  'revenue_by_segment',
  'orders_by_period',
  'returns_by_period',
  'top_products',
  'customer_activity_summary',
  'segment_order_distribution',
  'category_return_metrics',
] as const;

/** Runtime source of truth for capabilities that accept ComparisonDateRange params. */
export const COMPARISON_DATE_RANGE_CAPABILITIES = [
  'revenue_period_comparison',
  'revenue_by_region_comparison',
  'revenue_by_category_comparison',
] as const;

/** Runtime source of truth for capabilities that accept an optional limit. */
export const LIMIT_CAPABILITIES = [
  'revenue_by_product',
  'top_products',
] as const;

/** All 14 recognized capability strings. */
export const ANALYST_CAPABILITIES = [
  ...DATE_RANGE_CAPABILITIES,
  ...COMPARISON_DATE_RANGE_CAPABILITIES,
] as const;

/** The union type of all recognized capability strings. */
export type AnalystCapability = (typeof ANALYST_CAPABILITIES)[number];

export type AnalystRequest =
  | {
      capability: 'revenue_by_period';
      params: DateRange;
    }
  | {
      capability: 'revenue_by_region';
      params: DateRange;
    }
  | {
      capability: 'revenue_by_category';
      params: DateRange;
    }
  | {
      capability: 'revenue_by_product';
      params: DateRange;
      limit?: number;
    }
  | {
      capability: 'revenue_by_segment';
      params: DateRange;
    }
  | {
      capability: 'orders_by_period';
      params: DateRange;
    }
  | {
      capability: 'returns_by_period';
      params: DateRange;
    }
  | {
      capability: 'revenue_period_comparison';
      params: ComparisonDateRange;
    }
  | {
      capability: 'revenue_by_region_comparison';
      params: ComparisonDateRange;
    }
  | {
      capability: 'revenue_by_category_comparison';
      params: ComparisonDateRange;
    }
  | {
      capability: 'top_products';
      params: DateRange;
      limit?: number;
    }
  | {
      capability: 'customer_activity_summary';
      params: DateRange;
    }
  | {
      capability: 'segment_order_distribution';
      params: DateRange;
    }
  | {
      capability: 'category_return_metrics';
      params: DateRange;
    };