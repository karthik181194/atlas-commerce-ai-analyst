import { Injectable, Inject } from '@nestjs/common';
import type { AnalystPlanner } from './analyst-planner';
import { AnalystOrchestrator } from './analyst-orchestrator.service';
import type { AnalystSynthesizer } from './analyst-synthesizer';
import { BusinessAnalystResponse } from './business-analyst.types';

@Injectable()
export class BusinessAnalystService {
  constructor(
    @Inject('ANALYST_PLANNER') private readonly planner: AnalystPlanner,
    private readonly orchestrator: AnalystOrchestrator,
    @Inject('ANALYST_SYNTHESIZER') private readonly synthesizer: AnalystSynthesizer,
  ) {}

  async answer(question: string): Promise<BusinessAnalystResponse> {
    const plannerResult = await this.planner.plan(question);
    
    const evidence = await this.orchestrator.execute(plannerResult.plan);
    
    const synthesisResult = await this.synthesizer.synthesize({
      question,
      evidence,
    });

    return {
      question,
      answer: synthesisResult.answer,
    };
  }
}
