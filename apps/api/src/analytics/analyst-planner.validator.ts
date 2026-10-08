import { AnalystPlan } from './analyst-orchestration.types';
import { AnalystPlannerValidationResult } from './analyst-planner.types';
import { 
  ANALYST_CAPABILITIES, 
  DATE_RANGE_CAPABILITIES, 
  COMPARISON_DATE_RANGE_CAPABILITIES,
  LIMIT_CAPABILITIES
} from './analyst.types';

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: any): boolean {
  if (typeof dateStr !== 'string') return false;
  if (!DATE_FORMAT_REGEX.test(dateStr)) return false;
  
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

export function validateAnalystPlan(plan: any): AnalystPlannerValidationResult {
  const errors: string[] = [];

  if (!plan) {
    errors.push('plan is missing');
    return { valid: false, errors };
  }

  if (typeof plan.question !== 'string' || plan.question.trim() === '') {
    errors.push('plan.question must be a non-empty string');
  }

  if (!Array.isArray(plan.requests)) {
    errors.push('plan.requests must be an array');
    return { valid: errors.length === 0, errors };
  }

  plan.requests.forEach((req: any, index: number) => {
    if (!req) {
      errors.push(`request at index ${index} is missing`);
      return;
    }

    if (typeof req.capability !== 'string' || !(ANALYST_CAPABILITIES as readonly string[]).includes(req.capability)) {
      errors.push(`request at index ${index} has an unknown capability: ${req.capability}`);
      return;
    }

    if (!req.params || typeof req.params !== 'object') {
      errors.push(`request at index ${index} is missing params`);
      return;
    }

    // Validate limit if provided
    if ('limit' in req) {
      if (!(LIMIT_CAPABILITIES as readonly string[]).includes(req.capability)) {
        errors.push(`request at index ${index} (${req.capability}) does not support a limit parameter`);
      } else if (typeof req.limit !== 'number' || req.limit <= 0 || !Number.isInteger(req.limit)) {
        errors.push(`request at index ${index} has an invalid limit: must be a positive integer`);
      }
    }

    // Validate params based on capability
    if ((DATE_RANGE_CAPABILITIES as readonly string[]).includes(req.capability)) {
      const { startDate, endDate } = req.params;
      
      if (!startDate) {
        errors.push(`request at index ${index} is missing params.startDate`);
      } else if (!isValidDate(startDate)) {
        errors.push(`request at index ${index} has an invalid params.startDate format`);
      }

      if (!endDate) {
        errors.push(`request at index ${index} is missing params.endDate`);
      } else if (!isValidDate(endDate)) {
        errors.push(`request at index ${index} has an invalid params.endDate format`);
      }

      if (isValidDate(startDate) && isValidDate(endDate)) {
        if (new Date(startDate) > new Date(endDate)) {
          errors.push(`request at index ${index} has startDate after endDate`);
        }
      }
    } else if ((COMPARISON_DATE_RANGE_CAPABILITIES as readonly string[]).includes(req.capability)) {
      const { currentStartDate, currentEndDate, comparisonStartDate, comparisonEndDate } = req.params;

      if (!currentStartDate) errors.push(`request at index ${index} is missing params.currentStartDate`);
      else if (!isValidDate(currentStartDate)) errors.push(`request at index ${index} has an invalid params.currentStartDate format`);

      if (!currentEndDate) errors.push(`request at index ${index} is missing params.currentEndDate`);
      else if (!isValidDate(currentEndDate)) errors.push(`request at index ${index} has an invalid params.currentEndDate format`);

      if (isValidDate(currentStartDate) && isValidDate(currentEndDate) && new Date(currentStartDate) > new Date(currentEndDate)) {
          errors.push(`request at index ${index} has currentStartDate after currentEndDate`);
      }

      if (!comparisonStartDate) errors.push(`request at index ${index} is missing params.comparisonStartDate`);
      else if (!isValidDate(comparisonStartDate)) errors.push(`request at index ${index} has an invalid params.comparisonStartDate format`);

      if (!comparisonEndDate) errors.push(`request at index ${index} is missing params.comparisonEndDate`);
      else if (!isValidDate(comparisonEndDate)) errors.push(`request at index ${index} has an invalid params.comparisonEndDate format`);

      if (isValidDate(comparisonStartDate) && isValidDate(comparisonEndDate) && new Date(comparisonStartDate) > new Date(comparisonEndDate)) {
          errors.push(`request at index ${index} has comparisonStartDate after comparisonEndDate`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

