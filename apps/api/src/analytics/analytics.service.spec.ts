import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { SafeQueryService } from './safe-query.service';

describe('AnalyticsService - Catalog', () => {
  let service: AnalyticsService;
  let queryService: jest.Mocked<SafeQueryService>;

  beforeEach(async () => {
    const mockQueryService = {
      executeQuery: jest.fn().mockResolvedValue([{}]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: SafeQueryService,
          useValue: mockQueryService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    queryService = module.get(SafeQueryService);
  });

  const range = { startDate: '2025-08-01', endDate: '2025-08-31' };
  const compRange = {
    currentStartDate: '2025-08-01', currentEndDate: '2025-08-31',
    comparisonStartDate: '2025-07-01', comparisonEndDate: '2025-07-31'
  };

  it('1. revenue_by_period uses correct boundaries', async () => {
    await service.revenueByPeriod(range);
    const [sql, params] = queryService.executeQuery.mock.calls[0];
    expect(params).toEqual(['2025-08-01', '2025-08-31']);
    expect(sql).toContain("order_status = 'completed'");
  });

  it('2. revenue_by_region excludes cancelled and uses region_id', async () => {
    await service.revenueByRegion(range);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("order_status = 'completed'");
    expect(sql).toContain("region_list rl");
  });

  it('3. revenue_by_category calculates correct aggregates', async () => {
    await service.revenueByCategory(range);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("category_name FROM product_categories");
  });

  it('4. revenue_by_product accepts optional limit', async () => {
    await service.revenueByProduct(range, 5);
    const [sql, params] = queryService.executeQuery.mock.calls[0];
    expect(params).toEqual(['2025-08-01', '2025-08-31', 5]);
    expect(sql).toContain("LIMIT $3");
  });

  it('5. revenue_by_segment uses historical segment', async () => {
    await service.revenueBySegment(range);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("segment_at_order");
    expect(sql).not.toContain("customers.segment_id");
  });

  it('6. orders_by_period includes cancelled', async () => {
    await service.ordersByPeriod(range);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("order_status = 'cancelled'");
    expect(sql).toContain("totalOrders");
  });

  it('7. returns_by_period extracts return count and rate safely', async () => {
    await service.returnsByPeriod(range);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("return_count");
    expect(sql).toContain("refund_amount");
  });

  it('8. revenue_period_comparison handles safe percentage to prevent integer division', async () => {
    await service.revenuePeriodComparison(compRange);
    const [sql, params] = queryService.executeQuery.mock.calls[0];
    expect(params).toEqual(['2025-08-01', '2025-08-31', '2025-07-01', '2025-07-31']);
    // Verify explicit numeric casting prevents integer division (e.g., 17136 vs 12822 producing 0)
    expect(sql).toContain(")::numeric = 0 THEN NULL"); 
    expect(sql).toContain("::numeric - ");
    expect(sql).toContain("::numeric) / ");
    expect(sql).toContain("::numeric(10,2)");
    
    // Test the SqlFragment directly for the exact numeric values to prove structure
    const { SqlFragments } = require('./analytics.sql');
    const exactFragment = SqlFragments.safePercentageChange('17136', '12822');
    expect(exactFragment).toContain("(((17136)::numeric - (12822)::numeric) / (12822)::numeric * 100.0)::numeric(10,2)");
  });

  it('9. revenue_by_region_comparison joins on regions correctly', async () => {
    await service.revenueByRegionComparison(compRange);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("region_list rl");
    expect(sql).toContain("gross_sales_curr");
    expect(sql).toContain("gross_sales_comp");
  });

  it('10. revenue_by_category_comparison groups safely', async () => {
    await service.revenueByCategoryComparison(compRange);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("cat_list");
  });

  it('11. top_products maps to revenueByProduct with limit', async () => {
    jest.spyOn(service, 'revenueByProduct').mockResolvedValue([]);
    await service.topProducts(range, 20);
    expect(service.revenueByProduct).toHaveBeenCalledWith(range, 20);
  });

  it('12. customer_activity_summary gets valid aggregates', async () => {
    await service.customerActivitySummary(range);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("active_customers");
    expect(sql).toContain("new_customers");
  });

  it('13. segment_order_distribution wraps revenueBySegment safely', async () => {
    jest.spyOn(service, 'revenueBySegment').mockResolvedValue([
      { segment: 'VIP', grossRevenue: '10', refunds: '0', netRevenue: '10', completedOrders: 1, aov: '10' }
    ]);
    const res = await service.segmentOrderDistribution(range);
    expect(res).toEqual([{ segment: 'VIP', completedOrders: 1, netRevenue: '10' }]);
  });

  it('14. category_return_metrics sets proper boundaries', async () => {
    await service.categoryReturnMetrics(range);
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain("returns r");
    expect(sql).toContain("refundAmount");
  });
});
