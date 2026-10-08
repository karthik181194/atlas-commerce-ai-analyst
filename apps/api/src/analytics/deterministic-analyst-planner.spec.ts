import { DeterministicAnalystPlanner } from './deterministic-analyst-planner';
import { AnalystOrchestrator } from './analyst-orchestrator.service';
import { AnalyticsRouter } from './analytics.router';
import { validateAnalystPlan } from './analyst-planner.validator';

describe('DeterministicAnalystPlanner', () => {
  let planner: DeterministicAnalystPlanner;

  beforeEach(() => {
    planner = new DeterministicAnalystPlanner();
  });

  it('1. Implements AnalystPlanner', () => {
    expect(planner.plan).toBeDefined();
  });

  it('2. "Show August 2025 revenue"', async () => {
    const question = 'Show August 2025 revenue';
    const result = await planner.plan(question);
    
    expect(result.plan.question).toBe(question);
    expect(result.plan.requests).toHaveLength(1);
    expect(result.plan.requests[0].capability).toBe('revenue_by_period');
    expect(result.plan.requests[0].params).toEqual({
      startDate: '2025-08-01',
      endDate: '2025-08-31',
    });
  });

  it('3. "Compare August 2025 revenue with July 2025"', async () => {
    const question = 'Compare August 2025 revenue with July 2025';
    const result = await planner.plan(question);
    
    expect(result.plan.question).toBe(question);
    expect(result.plan.requests).toHaveLength(1);
    expect(result.plan.requests[0].capability).toBe('revenue_period_comparison');
    expect(result.plan.requests[0].params).toEqual({
      currentStartDate: '2025-08-01',
      currentEndDate: '2025-08-31',
      comparisonStartDate: '2025-07-01',
      comparisonEndDate: '2025-07-31',
    });
  });

  it('4. "Why did August 2025 revenue change?"', async () => {
    const question = 'Why did August 2025 revenue change?';
    const result = await planner.plan(question);
    
    expect(result.plan.question).toBe(question);
    expect(result.plan.requests).toHaveLength(3);
    
    expect(result.plan.requests[0].capability).toBe('revenue_period_comparison');
    expect(result.plan.requests[1].capability).toBe('revenue_by_region_comparison');
    expect(result.plan.requests[2].capability).toBe('revenue_by_category_comparison');
  });

  it('5. Unsupported question rejects with a clear error', async () => {
    await expect(planner.plan('What is the weather?')).rejects.toThrow('Unsupported question: "What is the weather?"');
  });

  it('6. Verify returned plans pass validateAnalystPlan', async () => {
    const questions = [
      'Show August 2025 revenue',
      'Compare August 2025 revenue with July 2025',
      'Why did August 2025 revenue change?'
    ];

    for (const q of questions) {
      const result = await planner.plan(q);
      const validation = validateAnalystPlan(result.plan);
      expect(validation.valid).toBe(true);
    }
  });

  it('7. Verify original question is preserved exactly', async () => {
    const question = 'Show August 2025 revenue';
    const result = await planner.plan(question);
    expect(result.plan.question).toBe(question);
  });
});

describe('Planner -> Validation -> Orchestrator Integration', () => {
  it('wires question -> deterministic plan -> validated plan -> orchestrator execution -> evidence', async () => {
    const planner = new DeterministicAnalystPlanner();
    
    const mockRouter = {
      execute: jest.fn().mockImplementation((req) => Promise.resolve({ capability: req.capability, data: 'test-data' }))
    } as unknown as AnalyticsRouter;
    
    const orchestrator = new AnalystOrchestrator(mockRouter);

    const question = 'Why did August 2025 revenue change?';
    
    // 1. Plan
    const { plan } = await planner.plan(question);
    
    // 2. Validate
    const validation = validateAnalystPlan(plan);
    expect(validation.valid).toBe(true);
    
    // 3. Orchestrate
    const evidence = await orchestrator.execute(plan);

    // 4. Verify evidence
    expect(evidence).toHaveLength(3);
    expect(evidence[0].capability).toBe('revenue_period_comparison');
    expect(evidence[0].data).toBe('test-data');
    expect(evidence[1].capability).toBe('revenue_by_region_comparison');
    expect(evidence[2].capability).toBe('revenue_by_category_comparison');
    
    expect(mockRouter.execute).toHaveBeenCalledTimes(3);
  });
});

