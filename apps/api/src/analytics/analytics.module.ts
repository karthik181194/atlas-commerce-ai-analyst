import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SafeQueryService } from './safe-query.service';
import { AnalyticsRouter } from './analytics.router';
import { AnalystOrchestrator } from './analyst-orchestrator.service';

@Module({
  providers: [AnalyticsService, SafeQueryService, AnalyticsRouter, AnalystOrchestrator],
  exports: [AnalyticsService, SafeQueryService, AnalyticsRouter, AnalystOrchestrator],
})
export class AnalyticsModule {}
