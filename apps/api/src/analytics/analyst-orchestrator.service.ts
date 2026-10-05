import { Injectable } from '@nestjs/common';
import { AnalyticsRouter } from './analytics.router';
import { AnalystPlan, AnalystEvidence } from './analyst-orchestration.types';

@Injectable()
export class AnalystOrchestrator {
  constructor(private readonly analyticsRouter: AnalyticsRouter) {}

  async execute(plan: AnalystPlan): Promise<AnalystEvidence[]> {
    const evidence: AnalystEvidence[] = [];

    for (const request of plan.requests) {
      const response = await this.analyticsRouter.execute(request);
      evidence.push(response);
    }

    return evidence;
  }
}

