import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { SafeQueryService } from './safe-query.service';

describe('AnalyticsService', () => {
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

  it('getRevenueByDateRange should use parameterized date inputs and exclude cancelled orders', async () => {
    queryService.executeQuery.mockResolvedValue([{ grossRevenue: '1000' }]);
    
    await service.getRevenueByDateRange({ startDate: '2025-01-01', endDate: '2025-01-31' });
    
    const [sql, params] = queryService.executeQuery.mock.calls[0];
    
    // Verify parameterized inputs
    expect(params).toEqual(['2025-01-01', '2025-01-31']);
    
    // Verify accounting rules in SQL
    expect(sql).toContain("o.order_status = 'completed'"); // Cancelled excluded
    expect(sql).toContain("o.order_date >= $1 AND o.order_date <= $2");
    expect(sql).toContain("r.processed_date >= $1 AND r.processed_date <= $2");
    expect(sql).toContain("SUM(oi.quantity * oi.unit_price_at_purchase)"); // Historical prices
    expect(sql).toContain("(g.gross_revenue - r.total_refunds)"); // Net revenue logic
  });

  it('getRevenueByRegion should attribute using orders.region_id', async () => {
    await service.getRevenueByRegion({ startDate: '2025-01-01', endDate: '2025-01-31' });
    
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain('o.region_id');
    expect(sql).not.toContain('customers.region_id'); // Ensure it's not joining customers for region
  });

  it('getRevenueBySegment should attribute using orders.segment_at_order', async () => {
    await service.getRevenueBySegment({ startDate: '2025-01-01', endDate: '2025-01-31' });
    
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain('o.segment_at_order');
    expect(sql).not.toContain('customers.segment_id'); // Ensure it's historical snapshot
  });

  it('getRevenueByCategoryAndProduct should use historical order prices', async () => {
    await service.getRevenueByCategoryAndProduct({ startDate: '2025-01-01', endDate: '2025-01-31' });
    
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain('SUM(oi.quantity * oi.unit_price_at_purchase)');
    expect(sql).not.toContain('p.unit_price'); // Shouldn't use master prices for historical revenue
  });

  it('getReturnMetrics should calculate refund amounts correctly', async () => {
    await service.getReturnMetrics({ startDate: '2025-01-01', endDate: '2025-01-31' });
    
    const [sql] = queryService.executeQuery.mock.calls[0];
    expect(sql).toContain('SUM(r.refund_amount)');
    expect(sql).toContain('r.processed_date >= $1');
  });

  it('getTopProducts should accept parameterized limit', async () => {
    await service.getTopProducts({ startDate: '2025-01-01', endDate: '2025-01-31' }, 5);
    
    const [sql, params] = queryService.executeQuery.mock.calls[0];
    expect(params).toEqual(['2025-01-01', '2025-01-31', 5]);
    expect(sql).toContain('LIMIT $3');
  });
});

