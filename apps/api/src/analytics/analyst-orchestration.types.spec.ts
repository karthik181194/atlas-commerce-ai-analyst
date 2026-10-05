import { AnalystPlan, AnalystEvidence, AnalystInvestigation } from './analyst-orchestration.types';

/**
 * These tests verify that the orchestration contract types compile correctly
 * and can represent realistic multi-step investigation plans. They exercise
 * TypeScript structural typing at runtime — if any type were misaligned with
 * AnalystRequest or AnalystResponse, the build would fail before tests run.
 */
describe('Analyst Orchestration Types', () => {
  it('AnalystPlan can hold multiple AnalystRequest objects of different kinds', () => {
    const plan: AnalystPlan = {
      question: 'Why did August revenue decline?',
      requests: [
        {
          capability: 'revenue_period_comparison',
          params: {
            currentStartDate: '2025-08-01',
            currentEndDate: '2025-08-31',
            comparisonStartDate: '2025-07-01',
            comparisonEndDate: '2025-07-31',
          },
        },
        {
          capability: 'revenue_by_region_comparison',
          params: {
            currentStartDate: '2025-08-01',
            currentEndDate: '2025-08-31',
            comparisonStartDate: '2025-07-01',
            comparisonEndDate: '2025-07-31',
          },
        },
        {
          capability: 'revenue_by_category_comparison',
          params: {
            currentStartDate: '2025-08-01',
            currentEndDate: '2025-08-31',
            comparisonStartDate: '2025-07-01',
            comparisonEndDate: '2025-07-31',
          },
        },
        {
          capability: 'category_return_metrics',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
        },
      ],
    };

    expect(plan.question).toBe('Why did August revenue decline?');
    expect(plan.requests).toHaveLength(4);
    expect(plan.requests[0].capability).toBe('revenue_period_comparison');
    expect(plan.requests[3].capability).toBe('category_return_metrics');
  });

  it('AnalystPlan can hold requests with optional limit', () => {
    const plan: AnalystPlan = {
      question: 'What are the top 5 products in August?',
      requests: [
        {
          capability: 'top_products',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
          limit: 5,
        },
      ],
    };

    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0].capability).toBe('top_products');
  });

  it('AnalystEvidence correctly represents a router response', () => {
    const evidence: AnalystEvidence = {
      capability: 'revenue_by_period',
      data: {
        grossRevenue: '50000',
        refunds: '2000',
        netRevenue: '48000',
        completedOrders: 500,
        aov: '96',
      },
    };

    expect(evidence.capability).toBe('revenue_by_period');
    expect(evidence.data).toBeDefined();
  });

  it('AnalystInvestigation ties a plan to its collected evidence', () => {
    const plan: AnalystPlan = {
      question: 'How is August performing?',
      requests: [
        {
          capability: 'revenue_by_period',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
        },
        {
          capability: 'orders_by_period',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
        },
      ],
    };

    const investigation: AnalystInvestigation = {
      plan,
      evidence: [
        { capability: 'revenue_by_period', data: { netRevenue: '48000' } },
        { capability: 'orders_by_period', data: { completedOrders: 500 } },
      ],
    };

    expect(investigation.plan.question).toBe('How is August performing?');
    expect(investigation.evidence).toHaveLength(2);
    expect(investigation.evidence[0].capability).toBe(investigation.plan.requests[0].capability);
    expect(investigation.evidence[1].capability).toBe(investigation.plan.requests[1].capability);
  });

  it('AnalystPlan with an empty requests array is valid', () => {
    const plan: AnalystPlan = {
      question: 'What is the meaning of life?',
      requests: [],
    };

    expect(plan.requests).toHaveLength(0);
  });
});

