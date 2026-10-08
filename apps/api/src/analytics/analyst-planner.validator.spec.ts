import { validateAnalystPlan } from './analyst-planner.validator';

describe('validateAnalystPlan', () => {
  it('1. Valid single-request plan -> valid true, no errors', () => {
    const plan = {
      question: 'Revenue for Aug 2025?',
      requests: [
        {
          capability: 'revenue_by_period',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('2. Valid multi-request plan -> valid true', () => {
    const plan = {
      question: 'Revenue for Aug 2025 by region and category?',
      requests: [
        {
          capability: 'revenue_by_region',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
        },
        {
          capability: 'revenue_by_category',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('3. Empty question -> invalid', () => {
    const plan = {
      question: '',
      requests: [],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('plan.question must be a non-empty string');
  });

  it('4. Missing requests -> invalid', () => {
    const plan = {
      question: 'Test',
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('plan.requests must be an array');
  });

  it('5. Requests not an array -> invalid', () => {
    const plan = {
      question: 'Test',
      requests: {},
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('plan.requests must be an array');
  });

  it('6. Unknown capability -> invalid', () => {
    const plan = {
      question: 'Test',
      requests: [
        {
          capability: 'make_coffee',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('request at index 0 has an unknown capability: make_coffee');
  });

  it('7. Missing params -> invalid', () => {
    const plan = {
      question: 'Test',
      requests: [
        {
          capability: 'revenue_by_period',
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('request at index 0 is missing params');
  });

  it('8. Invalid date format -> invalid', () => {
    const plan = {
      question: 'Test',
      requests: [
        {
          capability: 'revenue_by_period',
          params: { startDate: '2025/08/01', endDate: '2025-08-31' },
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('request at index 0 has an invalid params.startDate format');
  });

  it('9. startDate after endDate -> invalid', () => {
    const plan = {
      question: 'Test',
      requests: [
        {
          capability: 'revenue_by_period',
          params: { startDate: '2025-09-01', endDate: '2025-08-31' },
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('request at index 0 has startDate after endDate');
  });

  it('10. Invalid comparison dates -> invalid', () => {
    const plan = {
      question: 'Test',
      requests: [
        {
          capability: 'revenue_period_comparison',
          params: {
            currentStartDate: '2025-08-01',
            currentEndDate: '2025-08-31',
            comparisonStartDate: 'not-a-date',
            comparisonEndDate: '2025-07-31',
          },
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('request at index 0 has an invalid params.comparisonStartDate format');
  });

  it('11. Invalid limit -> invalid', () => {
    const limits = [0, -5, 5.5, '10'];
    for (const limit of limits) {
      const plan = {
        question: 'Test',
        requests: [
          {
            capability: 'top_products',
            params: { startDate: '2025-08-01', endDate: '2025-08-31' },
            limit,
          },
        ],
      };
      const result = validateAnalystPlan(plan);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('request at index 0 has an invalid limit: must be a positive integer');
    }
  });

  it('12. Multiple errors in one plan -> returns multiple errors', () => {
    const plan = {
      question: '',
      requests: [
        {
          capability: 'top_products',
          params: { startDate: '2025-08-01' }, // Missing endDate
          limit: -1, // Invalid limit
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
    expect(result.errors).toContain('plan.question must be a non-empty string');
    expect(result.errors).toContain('request at index 0 is missing params.endDate');
    expect(result.errors).toContain('request at index 0 has an invalid limit: must be a positive integer');
  });

  it('13. Boundary-valid dates -> pass', () => {
    const plan = {
      question: 'Test',
      requests: [
        {
          capability: 'revenue_by_period',
          params: { startDate: '2025-01-01', endDate: '2025-09-15' },
        },
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(true);
  });

  it('14. Valid comparison request -> pass', () => {
    const plan = {
      question: 'Test',
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
      ],
    };
    const result = validateAnalystPlan(plan);
    expect(result.valid).toBe(true);
  });
});

