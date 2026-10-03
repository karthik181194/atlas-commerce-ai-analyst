export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface ComparisonDateRange {
  currentStartDate: string;
  currentEndDate: string;
  comparisonStartDate: string;
  comparisonEndDate: string;
}

export interface RevenueResult {
  grossRevenue: string;
  refunds: string;
  netRevenue: string;
  completedOrders: number;
  aov: string;
}

export interface RegionRevenueResult extends RevenueResult {
  region: string;
}

export interface CategoryRevenueResult extends RevenueResult {
  category: string;
  unitsSold: number;
}

export interface ProductRevenueResult extends RevenueResult {
  product: string;
  category: string;
  unitsSold: number;
}

export interface SegmentRevenueResult extends RevenueResult {
  segment: string;
}

export interface OrderPeriodResult {
  completedOrders: number;
  cancelledOrders: number;
  totalOrders: number;
}

export interface ReturnMetricsResult {
  returnCount: number;
  refundAmount: string;
  returnRate: string | null;
}

export interface CategoryReturnMetricsResult extends ReturnMetricsResult {
  category: string;
}

export interface RevenueComparisonResult {
  currentNetRevenue: string;
  comparisonNetRevenue: string;
  absoluteChange: string;
  percentageChange: string | null;
  currentCompletedOrders: number;
  comparisonCompletedOrders: number;
  orderChangePercentage: string | null;
  currentAov: string;
  comparisonAov: string;
  aovChangePercentage: string | null;
}

export interface RegionRevenueComparisonResult extends RevenueComparisonResult {
  region: string;
}

export interface CategoryRevenueComparisonResult extends RevenueComparisonResult {
  category: string;
}

export interface CustomerActivitySummaryResult {
  activeCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  completedOrders: number;
  ordersPerActiveCustomer: string;
}

export interface SegmentOrderDistributionResult {
  segment: string;
  completedOrders: number;
  netRevenue: string;
}

