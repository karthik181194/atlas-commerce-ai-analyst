import { GoogleGenAI, Type } from '@google/genai';
import { AnalystPlanner } from './analyst-planner';
import { AnalystPlannerResult } from './analyst-planner.types';
import { validateAnalystPlan } from './analyst-planner.validator';
import { ANALYST_CAPABILITIES } from './analyst.types';

export class GeminiAnalystPlanner implements AnalystPlanner {
  private client: GoogleGenAI;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY environment variable. The Gemini Analyst Planner requires an API key to function.');
    }

    this.client = new GoogleGenAI({ apiKey });
    this.modelName = process.env.GEMINI_MODEL ?? 'gemini-3.7-flash';
  }

  async plan(question: string): Promise<AnalystPlannerResult> {
    if (!question || question.trim() === '') {
      throw new Error('Question must be a non-empty string.');
    }

    const systemInstruction = `
You are an analyst planning component.
Your job is to translate the user's business question into one or more existing analytical capabilities.
You must return ONLY the requested structured JSON schema.
You must never generate SQL.
You must never invent capabilities. Only use the provided capability names.

IMPORTANT PARAMETER RULES:
You must strictly follow these parameter shapes based on the capability chosen. Never omit required fields. Never use a different date field name. Never put comparison dates into startDate/endDate. Never invent parameter names.

1. DATE RANGE CAPABILITIES:
(revenue_by_period, revenue_by_region, revenue_by_category, revenue_by_product, revenue_by_segment, orders_by_period, returns_by_period, top_products, customer_activity_summary, segment_order_distribution, category_return_metrics)
MUST contain exactly:
- startDate: "YYYY-MM-DD"
- endDate: "YYYY-MM-DD"

2. COMPARISON CAPABILITIES:
(revenue_period_comparison, revenue_by_region_comparison, revenue_by_category_comparison)
MUST contain exactly:
- currentStartDate: "YYYY-MM-DD"
- currentEndDate: "YYYY-MM-DD"
- comparisonStartDate: "YYYY-MM-DD"
- comparisonEndDate: "YYYY-MM-DD"

3. LIMIT CAPABILITIES:
(revenue_by_product, top_products)
MAY additionally contain:
- limit: integer (e.g. 5, 10)

DATE RULES:
Dates must be exact YYYY-MM-DD strings.
The dataset's fixed as-of date is 2025-09-15. This is "today" for the dataset.
The dataset begins 2023-03-01.
For August 2025 use 2025-08-01 through 2025-08-31.
For July 2025 use 2025-07-01 through 2025-07-31.
If the question refers to dates within the dataset (like "August revenue" or "last month"), resolve them into concrete date ranges relative to the as-of date (2025-09-15).

EXAMPLES OF REQUIRED OUTPUT:

Question: "Show August 2025 revenue"
Output:
{
  "question": "Show August 2025 revenue",
  "requests": [
    {
      "capability": "revenue_by_period",
      "params": {
        "startDate": "2025-08-01",
        "endDate": "2025-08-31"
      }
    }
  ]
}

Question: "Why did August 2025 revenue change?"
Output:
{
  "question": "Why did August 2025 revenue change?",
  "requests": [
    {
      "capability": "revenue_period_comparison",
      "params": {
        "currentStartDate": "2025-08-01",
        "currentEndDate": "2025-08-31",
        "comparisonStartDate": "2025-07-01",
        "comparisonEndDate": "2025-07-31"
      }
    },
    {
      "capability": "revenue_by_region_comparison",
      "params": {
        "currentStartDate": "2025-08-01",
        "currentEndDate": "2025-08-31",
        "comparisonStartDate": "2025-07-01",
        "comparisonEndDate": "2025-07-31"
      }
    },
    {
      "capability": "revenue_by_category_comparison",
      "params": {
        "currentStartDate": "2025-08-01",
        "currentEndDate": "2025-08-31",
        "comparisonStartDate": "2025-07-01",
        "comparisonEndDate": "2025-07-31"
      }
    }
  ]
}

If the question cannot be mapped confidently to the available capabilities, produce the closest structurally valid plan only when appropriate; otherwise the application should reject/handle the plan rather than inventing capabilities.
`;

    const anyOfBranches: any[] = [];

    const dateRangeCapabilities = [
      'revenue_by_period',
      'revenue_by_region',
      'revenue_by_category',
      'revenue_by_segment',
      'orders_by_period',
      'returns_by_period',
      'customer_activity_summary',
      'segment_order_distribution',
      'category_return_metrics',
    ];

    for (const cap of dateRangeCapabilities) {
      anyOfBranches.push({
        type: Type.OBJECT,
        properties: {
          capability: { type: Type.STRING, enum: [cap] },
          params: {
            type: Type.OBJECT,
            properties: {
              startDate: { type: Type.STRING },
              endDate: { type: Type.STRING },
            },
            required: ['startDate', 'endDate'],
            additionalProperties: false,
          },
        },
        required: ['capability', 'params'],
        additionalProperties: false,
      });
    }

    const dateRangeWithLimitCapabilities = [
      'revenue_by_product',
      'top_products',
    ];

    for (const cap of dateRangeWithLimitCapabilities) {
      anyOfBranches.push({
        type: Type.OBJECT,
        properties: {
          capability: { type: Type.STRING, enum: [cap] },
          limit: { type: Type.INTEGER },
          params: {
            type: Type.OBJECT,
            properties: {
              startDate: { type: Type.STRING },
              endDate: { type: Type.STRING },
            },
            required: ['startDate', 'endDate'],
            additionalProperties: false,
          },
        },
        required: ['capability', 'params'],
        additionalProperties: false,
      });
    }

    const comparisonCapabilities = [
      'revenue_period_comparison',
      'revenue_by_region_comparison',
      'revenue_by_category_comparison',
    ];

    for (const cap of comparisonCapabilities) {
      anyOfBranches.push({
        type: Type.OBJECT,
        properties: {
          capability: { type: Type.STRING, enum: [cap] },
          params: {
            type: Type.OBJECT,
            properties: {
              currentStartDate: { type: Type.STRING },
              currentEndDate: { type: Type.STRING },
              comparisonStartDate: { type: Type.STRING },
              comparisonEndDate: { type: Type.STRING },
            },
            required: ['currentStartDate', 'currentEndDate', 'comparisonStartDate', 'comparisonEndDate'],
            additionalProperties: false,
          },
        },
        required: ['capability', 'params'],
        additionalProperties: false,
      });
    }

    const responseSchema: any = {
      type: Type.OBJECT,
      properties: {
        question: {
          type: Type.STRING,
          description: "The question being planned for",
        },
        requests: {
          type: Type.ARRAY,
          items: {
            anyOf: anyOfBranches,
          }
        }
      },
      required: ['question', 'requests'],
    };

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.modelName,
        contents: question,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });
    } catch (error: any) {
      throw new Error(`Gemini API request failed: ${error.message}`);
    }

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini API returned an empty response.');
    }

    let plan;
    try {
      plan = JSON.parse(responseText);
    } catch (e: any) {
      throw new Error(`Failed to parse Gemini response as JSON: ${e.message}`);
    }

    // Preserve the original question
    plan.question = question;

    const validationResult = validateAnalystPlan(plan);
    if (!validationResult.valid) {
      throw new Error(`Plan validation failed: ${validationResult.errors.join(', ')}`);
    }

    return { plan };
  }
}

