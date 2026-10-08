import { AnalystPlan } from './analyst-orchestration.types';

export interface AnalystPlannerResult {
  plan: AnalystPlan;
}

export interface AnalystPlannerValidationResult {
  valid: boolean;
  errors: string[];
}

