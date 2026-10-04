import { Injectable } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalystRequest } from './analyst.types';

export interface AnalystResponse {
  capability: AnalystRequest['capability'];
  data: unknown;
}

@Injectable()
export class AnalyticsRouter {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async execute(request: AnalystRequest): Promise<AnalystResponse> {
    switch (request.capability) {
      case 'revenue_by_period':
        return {
          capability: request.capability,
          data: await this.analyticsService.revenueByPeriod(request.params),
        };

      case 'revenue_by_region':
        return {
          capability: request.capability,
          data: await this.analyticsService.revenueByRegion(request.params),
        };

      case 'revenue_by_category':
        return {
          capability: request.capability,
          data: await this.analyticsService.revenueByCategory(request.params),
        };

      case 'revenue_by_product':
        return {
          capability: request.capability,
          data: await this.analyticsService.revenueByProduct(
            request.params,
            request.limit,
          ),
        };

      case 'revenue_by_segment':
        return {
          capability: request.capability,
          data: await this.analyticsService.revenueBySegment(request.params),
        };

      case 'orders_by_period':
        return {
          capability: request.capability,
          data: await this.analyticsService.ordersByPeriod(request.params),
        };

      case 'returns_by_period':
        return {
          capability: request.capability,
          data: await this.analyticsService.returnsByPeriod(request.params),
        };

      case 'revenue_period_comparison':
        return {
          capability: request.capability,
          data: await this.analyticsService.revenuePeriodComparison(
            request.params,
          ),
        };

      case 'revenue_by_region_comparison':
        return {
          capability: request.capability,
          data: await this.analyticsService.revenueByRegionComparison(
            request.params,
          ),
        };

      case 'revenue_by_category_comparison':
        return {
          capability: request.capability,
          data: await this.analyticsService.revenueByCategoryComparison(
            request.params,
          ),
        };

      case 'top_products':
        return {
          capability: request.capability,
          data: await this.analyticsService.topProducts(
            request.params,
            request.limit,
          ),
        };

      case 'customer_activity_summary':
        return {
          capability: request.capability,
          data: await this.analyticsService.customerActivitySummary(
            request.params,
          ),
        };

      case 'segment_order_distribution':
        return {
          capability: request.capability,
          data: await this.analyticsService.segmentOrderDistribution(
            request.params,
          ),
        };

      case 'category_return_metrics':
        return {
          capability: request.capability,
          data: await this.analyticsService.categoryReturnMetrics(
            request.params,
          ),
        };
    }
  }
}