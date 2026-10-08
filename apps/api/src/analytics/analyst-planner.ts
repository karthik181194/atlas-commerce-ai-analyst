import { AnalystPlannerResult } from './analyst-planner.types';

export interface AnalystPlanner {
  plan(question: string): Promise<AnalystPlannerResult>;
}

