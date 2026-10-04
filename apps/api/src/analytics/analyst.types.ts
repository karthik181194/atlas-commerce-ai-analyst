import {
  ComparisonDateRange,
  DateRange,
} from './analytics.types';

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