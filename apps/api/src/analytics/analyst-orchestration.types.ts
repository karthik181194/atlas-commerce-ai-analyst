import { AnalystRequest } from './analyst.types';
import { AnalystResponse } from './analytics.router';

/**
 * An investigation plan produced by the future AI/orchestration layer.
 *
 * The orchestrator will decompose a natural-language question into one or more
 * typed AnalystRequest objects, each targeting a known analytical capability.
 *
 * Future flow:
 *   question → LLM → AnalystPlan → orchestrator → AnalyticsRouter → AnalystEvidence[]
 */
export interface AnalystPlan {
  /** The original natural-language question. */
  question: string;

  /** Ordered list of analytical requests to execute. */
  requests: AnalystRequest[];
}

/**
 * The result of executing a single AnalystRequest through the AnalyticsRouter.
 *
 * Structurally identical to AnalystResponse (defined in analytics.router.ts).
 * Aliased here so the orchestration contract can reference it without importing
 * runtime router internals.
 */
export type AnalystEvidence = AnalystResponse;

/**
 * The complete result of executing an AnalystPlan.
 *
 * Future flow:
 *   AnalystPlan → orchestrator executes each request → AnalystInvestigation
 *   → LLM synthesis → final analyst answer
 */
export interface AnalystInvestigation {
  /** The original plan that was executed. */
  plan: AnalystPlan;

  /** Evidence collected from each executed request, in plan order. */
  evidence: AnalystEvidence[];
}

