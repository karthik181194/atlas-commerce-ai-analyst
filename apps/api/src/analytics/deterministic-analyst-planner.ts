import { AnalystPlanner } from './analyst-planner';
import { AnalystPlannerResult } from './analyst-planner.types';
import { validateAnalystPlan } from './analyst-planner.validator';
import { AnalystPlan } from './analyst-orchestration.types';

export class DeterministicAnalystPlanner implements AnalystPlanner {
  async plan(question: string): Promise<AnalystPlannerResult> {
    let plan: AnalystPlan;

    if (question === 'Show August 2025 revenue') {
      plan = {
        question,
        requests: [
          {
            capability: 'revenue_by_period',
            params: {
              startDate: '2025-08-01',
              endDate: '2025-08-31',
            },
          },
        ],
      };
    } else if (question === 'Compare August 2025 revenue with July 2025') {
      plan = {
        question,
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
    } else if (question === 'Why did August 2025 revenue change?') {
      plan = {
        question,
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
        ],
      };
    } else {
      throw new Error(`Unsupported question: "${question}"`);
    }

    const validationResult = validateAnalystPlan(plan);
    if (!validationResult.valid) {
      throw new Error(`Plan validation failed: ${validationResult.errors.join(', ')}`);
    }

    return { plan };
  }
}

