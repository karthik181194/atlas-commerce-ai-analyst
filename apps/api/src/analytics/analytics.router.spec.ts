import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsRouter } from './analytics.router';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsRouter', () => {
  let router: AnalyticsRouter;
  let service: jest.Mocked<AnalyticsService>;

  const mockRevenueResult = { grossRevenue: '1000', refunds: '50', netRevenue: '950', completedOrders: 10, aov: '95' };
  const mockRegionResults = [{ region: 'North', ...mockRevenueResult }];
  const mockCategoryResults = [{ category: 'Electronics', unitsSold: 20, ...mockRevenueResult }];
  const mockProductResults = [{ product: 'Widget', category: 'Electronics', unitsSold: 5, ...mockRevenueResult }];
  const mockSegmentResults = [{ segment: 'VIP', ...mockRevenueResult }];
  const mockOrderResult = { completedOrders: 80, cancelledOrders: 20, totalOrders: 100 };
  const mockReturnResult = { returnCount: 5, refundAmount: '250', returnRate: '0.0625' };
  const mockComparisonResult = {
    currentNetRevenue: '950', comparisonNetRevenue: '800',
    absoluteChange: '150', percentageChange: '18.75',
    currentCompletedOrders: 10, comparisonCompletedOrders: 8,
    orderChangePercentage: '25.00',
    currentAov: '95', comparisonAov: '100', aovChangePercentage: '-5.00',
  };
  const mockRegionCompResults = [{ region: 'North', ...mockComparisonResult }];
  const mockCategoryCompResults = [{ category: 'Electronics', ...mockComparisonResult }];
  const mockCustomerActivity = { activeCustomers: 50, newCustomers: 10, repeatCustomers: 30, completedOrders: 80, ordersPerActiveCustomer: '1.60' };
  const mockSegmentDistribution = [{ segment: 'VIP', completedOrders: 40, netRevenue: '500' }];
  const mockCategoryReturns = [{ category: 'Electronics', returnCount: 3, refundAmount: '150', returnRate: '0.0375' }];

  const dateRange = { startDate: '2025-08-01', endDate: '2025-08-31' };
  const compRange = {
    currentStartDate: '2025-08-01', currentEndDate: '2025-08-31',
    comparisonStartDate: '2025-07-01', comparisonEndDate: '2025-07-31',
  };

  beforeEach(async () => {
    const mockService: Partial<Record<keyof AnalyticsService, jest.Mock>> = {
      revenueByPeriod: jest.fn().mockResolvedValue(mockRevenueResult),
      revenueByRegion: jest.fn().mockResolvedValue(mockRegionResults),
      revenueByCategory: jest.fn().mockResolvedValue(mockCategoryResults),
      revenueByProduct: jest.fn().mockResolvedValue(mockProductResults),
      revenueBySegment: jest.fn().mockResolvedValue(mockSegmentResults),
      ordersByPeriod: jest.fn().mockResolvedValue(mockOrderResult),
      returnsByPeriod: jest.fn().mockResolvedValue(mockReturnResult),
      revenuePeriodComparison: jest.fn().mockResolvedValue(mockComparisonResult),
      revenueByRegionComparison: jest.fn().mockResolvedValue(mockRegionCompResults),
      revenueByCategoryComparison: jest.fn().mockResolvedValue(mockCategoryCompResults),
      topProducts: jest.fn().mockResolvedValue(mockProductResults),
      customerActivitySummary: jest.fn().mockResolvedValue(mockCustomerActivity),
      segmentOrderDistribution: jest.fn().mockResolvedValue(mockSegmentDistribution),
      categoryReturnMetrics: jest.fn().mockResolvedValue(mockCategoryReturns),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsRouter,
        { provide: AnalyticsService, useValue: mockService },
      ],
    }).compile();

    router = module.get<AnalyticsRouter>(AnalyticsRouter);
    service = module.get(AnalyticsService);
  });

  it('1. revenue_by_period dispatches correctly', async () => {
    const result = await router.execute({ capability: 'revenue_by_period', params: dateRange });
    expect(result.capability).toBe('revenue_by_period');
    expect(result.data).toEqual(mockRevenueResult);
    expect(service.revenueByPeriod).toHaveBeenCalledWith(dateRange);
  });

  it('2. revenue_by_region dispatches correctly', async () => {
    const result = await router.execute({ capability: 'revenue_by_region', params: dateRange });
    expect(result.capability).toBe('revenue_by_region');
    expect(result.data).toEqual(mockRegionResults);
    expect(service.revenueByRegion).toHaveBeenCalledWith(dateRange);
  });

  it('3. revenue_by_category dispatches correctly', async () => {
    const result = await router.execute({ capability: 'revenue_by_category', params: dateRange });
    expect(result.capability).toBe('revenue_by_category');
    expect(result.data).toEqual(mockCategoryResults);
    expect(service.revenueByCategory).toHaveBeenCalledWith(dateRange);
  });

  it('4. revenue_by_product dispatches with no limit', async () => {
    const result = await router.execute({ capability: 'revenue_by_product', params: dateRange });
    expect(result.capability).toBe('revenue_by_product');
    expect(result.data).toEqual(mockProductResults);
    expect(service.revenueByProduct).toHaveBeenCalledWith(dateRange, undefined);
  });

  it('4b. revenue_by_product passes optional limit', async () => {
    const result = await router.execute({ capability: 'revenue_by_product', params: dateRange, limit: 5 });
    expect(result.capability).toBe('revenue_by_product');
    expect(service.revenueByProduct).toHaveBeenCalledWith(dateRange, 5);
  });

  it('5. revenue_by_segment dispatches correctly', async () => {
    const result = await router.execute({ capability: 'revenue_by_segment', params: dateRange });
    expect(result.capability).toBe('revenue_by_segment');
    expect(result.data).toEqual(mockSegmentResults);
    expect(service.revenueBySegment).toHaveBeenCalledWith(dateRange);
  });

  it('6. orders_by_period dispatches correctly', async () => {
    const result = await router.execute({ capability: 'orders_by_period', params: dateRange });
    expect(result.capability).toBe('orders_by_period');
    expect(result.data).toEqual(mockOrderResult);
    expect(service.ordersByPeriod).toHaveBeenCalledWith(dateRange);
  });

  it('7. returns_by_period dispatches correctly', async () => {
    const result = await router.execute({ capability: 'returns_by_period', params: dateRange });
    expect(result.capability).toBe('returns_by_period');
    expect(result.data).toEqual(mockReturnResult);
    expect(service.returnsByPeriod).toHaveBeenCalledWith(dateRange);
  });

  it('8. revenue_period_comparison dispatches correctly', async () => {
    const result = await router.execute({ capability: 'revenue_period_comparison', params: compRange });
    expect(result.capability).toBe('revenue_period_comparison');
    expect(result.data).toEqual(mockComparisonResult);
    expect(service.revenuePeriodComparison).toHaveBeenCalledWith(compRange);
  });

  it('9. revenue_by_region_comparison dispatches correctly', async () => {
    const result = await router.execute({ capability: 'revenue_by_region_comparison', params: compRange });
    expect(result.capability).toBe('revenue_by_region_comparison');
    expect(result.data).toEqual(mockRegionCompResults);
    expect(service.revenueByRegionComparison).toHaveBeenCalledWith(compRange);
  });

  it('10. revenue_by_category_comparison dispatches correctly', async () => {
    const result = await router.execute({ capability: 'revenue_by_category_comparison', params: compRange });
    expect(result.capability).toBe('revenue_by_category_comparison');
    expect(result.data).toEqual(mockCategoryCompResults);
    expect(service.revenueByCategoryComparison).toHaveBeenCalledWith(compRange);
  });

  it('11. top_products dispatches with no limit (uses default)', async () => {
    const result = await router.execute({ capability: 'top_products', params: dateRange });
    expect(result.capability).toBe('top_products');
    expect(result.data).toEqual(mockProductResults);
    expect(service.topProducts).toHaveBeenCalledWith(dateRange, undefined);
  });

  it('11b. top_products passes optional limit', async () => {
    const result = await router.execute({ capability: 'top_products', params: dateRange, limit: 20 });
    expect(result.capability).toBe('top_products');
    expect(service.topProducts).toHaveBeenCalledWith(dateRange, 20);
  });

  it('12. customer_activity_summary dispatches correctly', async () => {
    const result = await router.execute({ capability: 'customer_activity_summary', params: dateRange });
    expect(result.capability).toBe('customer_activity_summary');
    expect(result.data).toEqual(mockCustomerActivity);
    expect(service.customerActivitySummary).toHaveBeenCalledWith(dateRange);
  });

  it('13. segment_order_distribution dispatches correctly', async () => {
    const result = await router.execute({ capability: 'segment_order_distribution', params: dateRange });
    expect(result.capability).toBe('segment_order_distribution');
    expect(result.data).toEqual(mockSegmentDistribution);
    expect(service.segmentOrderDistribution).toHaveBeenCalledWith(dateRange);
  });

  it('14. category_return_metrics dispatches correctly', async () => {
    const result = await router.execute({ capability: 'category_return_metrics', params: dateRange });
    expect(result.capability).toBe('category_return_metrics');
    expect(result.data).toEqual(mockCategoryReturns);
    expect(service.categoryReturnMetrics).toHaveBeenCalledWith(dateRange);
  });
});

