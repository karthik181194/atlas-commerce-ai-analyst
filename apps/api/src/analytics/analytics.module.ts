import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SafeQueryService } from './safe-query.service';
import { AnalyticsRouter } from './analytics.router';
import { AnalystOrchestrator } from './analyst-orchestrator.service';
import { BusinessAnalystService } from './business-analyst.service';
import { GeminiAnalystPlanner } from './gemini-analyst-planner';
import { GeminiAnalystSynthesizer } from './gemini-analyst-synthesizer';

@Module({
  providers: [
    AnalyticsService, 
    SafeQueryService, 
    AnalyticsRouter, 
    AnalystOrchestrator,
    BusinessAnalystService,
    {
      provide: 'ANALYST_PLANNER',
      useClass: GeminiAnalystPlanner,
    },
    {
      provide: 'ANALYST_SYNTHESIZER',
      useClass: GeminiAnalystSynthesizer,
    }
  ],
  exports: [
    AnalyticsService, 
    SafeQueryService, 
    AnalyticsRouter, 
    AnalystOrchestrator,
    BusinessAnalystService,
  ],
})
export class AnalyticsModule {}
