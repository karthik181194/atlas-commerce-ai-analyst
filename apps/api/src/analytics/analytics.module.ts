import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SafeQueryService } from './safe-query.service';
import { AnalyticsRouter } from './analytics.router';

@Module({
  providers: [AnalyticsService, SafeQueryService, AnalyticsRouter],
  exports: [AnalyticsService, SafeQueryService, AnalyticsRouter],
})
export class AnalyticsModule {}

