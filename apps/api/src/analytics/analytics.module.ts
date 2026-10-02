import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SafeQueryService } from './safe-query.service';

@Module({
  providers: [AnalyticsService, SafeQueryService],
  exports: [AnalyticsService, SafeQueryService],
})
export class AnalyticsModule {}

