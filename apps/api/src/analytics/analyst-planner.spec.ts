import { AnalystPlanner } from './analyst-planner';
import { AnalystPlannerResult } from './analyst-planner.types';

class FakeAnalystPlanner implements AnalystPlanner {
  async plan(question: string): Promise<AnalystPlannerResult> {
    return {
      plan: {
        question,
        requests: [],
      },
    };
  }
}

describe('AnalystPlanner Contract', () => {
  it('1. A valid implementation can satisfy AnalystPlanner', async () => {
    const planner: AnalystPlanner = new FakeAnalystPlanner();
    expect(planner).toBeDefined();
  });

  it('2. Calling plan() returns an AnalystPlannerResult', async () => {
    const planner: AnalystPlanner = new FakeAnalystPlanner();
    const result = await planner.plan('What is the revenue for August?');
    
    expect(result).toBeDefined();
    expect(result.plan).toBeDefined();
    expect(Array.isArray(result.plan.requests)).toBe(true);
  });

  it('3. The original question is preserved in the returned plan', async () => {
    const question = 'How many returns in July?';
    const planner: AnalystPlanner = new FakeAnalystPlanner();
    const result = await planner.plan(question);
    
    expect(result.plan.question).toBe(question);
  });
});

