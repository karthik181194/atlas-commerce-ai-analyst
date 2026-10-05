import { Test, TestingModule } from '@nestjs/testing';
import { AnalystOrchestrator } from './analyst-orchestrator.service';
import { AnalyticsRouter } from './analytics.router';
import { AnalystPlan } from './analyst-orchestration.types';
import { AnalystRequest } from './analyst.types';

describe('AnalystOrchestrator', () => {
  let orchestrator: AnalystOrchestrator;
  let router: jest.Mocked<AnalyticsRouter>;

  beforeEach(async () => {
    const mockRouter = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalystOrchestrator,
        {
          provide: AnalyticsRouter,
          useValue: mockRouter,
        },
      ],
    }).compile();

    orchestrator = module.get<AnalystOrchestrator>(AnalystOrchestrator);
    router = module.get(AnalyticsRouter);
  });

  it('1. Empty plan returns empty evidence', async () => {
    const plan: AnalystPlan = {
      question: 'test',
      requests: [],
    };

    const result = await orchestrator.execute(plan);

    expect(result).toEqual([]);
    expect(router.execute).not.toHaveBeenCalled();
  });

  it('2. Single request executes and returns evidence', async () => {
    const request: AnalystRequest = {
      capability: 'revenue_by_period',
      params: { startDate: '2025-08-01', endDate: '2025-08-31' },
    };
    const plan: AnalystPlan = {
      question: 'revenue?',
      requests: [request],
    };

    const expectedResponse = { capability: 'revenue_by_period', data: { netRevenue: '100' } };
    router.execute.mockResolvedValue(expectedResponse as any);

    const result = await orchestrator.execute(plan);

    expect(router.execute).toHaveBeenCalledTimes(1);
    expect(router.execute).toHaveBeenCalledWith(request);
    expect(result).toEqual([expectedResponse]);
  });

  it('3. Multiple requests execute sequentially and preserve order', async () => {
    const req1: AnalystRequest = { capability: 'revenue_period_comparison', params: { currentStartDate: '1', currentEndDate: '2', comparisonStartDate: '3', comparisonEndDate: '4' } };
    const req2: AnalystRequest = { capability: 'revenue_by_region_comparison', params: { currentStartDate: '1', currentEndDate: '2', comparisonStartDate: '3', comparisonEndDate: '4' } };
    const req3: AnalystRequest = { capability: 'revenue_by_category_comparison', params: { currentStartDate: '1', currentEndDate: '2', comparisonStartDate: '3', comparisonEndDate: '4' } };
    
    const plan: AnalystPlan = {
      question: 'multiple?',
      requests: [req1, req2, req3],
    };

    const res1 = { capability: 'revenue_period_comparison', data: { r: 1 } };
    const res2 = { capability: 'revenue_by_region_comparison', data: { r: 2 } };
    const res3 = { capability: 'revenue_by_category_comparison', data: { r: 3 } };

    router.execute
      .mockResolvedValueOnce(res1 as any)
      .mockResolvedValueOnce(res2 as any)
      .mockResolvedValueOnce(res3 as any);

    const result = await orchestrator.execute(plan);

    expect(router.execute).toHaveBeenCalledTimes(3);
    expect(router.execute).toHaveBeenNthCalledWith(1, req1);
    expect(router.execute).toHaveBeenNthCalledWith(2, req2);
    expect(router.execute).toHaveBeenNthCalledWith(3, req3);
    
    expect(result).toEqual([res1, res2, res3]);
  });

  it('4. Router error propagation rejects without catching', async () => {
    const request: AnalystRequest = {
      capability: 'revenue_by_period',
      params: { startDate: '2025-08-01', endDate: '2025-08-31' },
    };
    const plan: AnalystPlan = {
      question: 'revenue?',
      requests: [request],
    };

    const error = new Error('Database connection failed');
    router.execute.mockRejectedValue(error);

    await expect(orchestrator.execute(plan)).rejects.toThrow(error);
    expect(router.execute).toHaveBeenCalledTimes(1);
  });

  it('5. Verify no extra calls are made', async () => {
    const req1: AnalystRequest = { capability: 'revenue_by_period', params: { startDate: '1', endDate: '2' } };
    const req2: AnalystRequest = { capability: 'orders_by_period', params: { startDate: '1', endDate: '2' } };
    
    const plan: AnalystPlan = {
      question: 'two?',
      requests: [req1, req2],
    };

    router.execute.mockResolvedValue({ capability: 'revenue_by_period', data: {} } as any);

    await orchestrator.execute(plan);

    expect(router.execute).toHaveBeenCalledTimes(2);
  });
});

