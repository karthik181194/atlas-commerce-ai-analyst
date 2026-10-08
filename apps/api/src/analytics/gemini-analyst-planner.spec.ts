import { GeminiAnalystPlanner } from './gemini-analyst-planner';
import { GoogleGenAI } from '@google/genai';
import { validateAnalystPlan } from './analyst-planner.validator';

jest.mock('@google/genai');

describe('GeminiAnalystPlanner', () => {
  let generateContentMock: jest.Mock;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_MODEL;

    generateContentMock = jest.fn();

    (GoogleGenAI as jest.Mock).mockImplementation(() => {
      return {
        models: {
          generateContent: generateContentMock,
        },
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('1. Implements AnalystPlanner', () => {
    const planner = new GeminiAnalystPlanner();
    expect(planner.plan).toBeDefined();
  });

  it('2. Sends the user\'s question to Gemini & 3. Uses structured JSON output configuration', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ question: 'Test?', requests: [] }),
    });

    await planner.plan('Test?');

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const callArgs = generateContentMock.mock.calls[0][0];
    
    expect(callArgs.model).toBe('gemini-3.7-flash');
    expect(callArgs.contents).toBe('Test?');
    expect(callArgs.config.responseMimeType).toBe('application/json');
    expect(callArgs.config.responseSchema).toBeDefined();
  });

  it('4a. Valid revenue_by_period response is accepted', async () => {
    const planner = new GeminiAnalystPlanner();
    
    const validPlan = {
      question: 'Revenue for Aug 2025?',
      requests: [
        {
          capability: 'revenue_by_period',
          params: { startDate: '2025-08-01', endDate: '2025-08-31' },
        },
      ],
    };

    generateContentMock.mockResolvedValue({
      text: JSON.stringify(validPlan),
    });

    const result = await planner.plan('Revenue for Aug 2025?');
    
    expect(result.plan).toEqual(validPlan);
    expect(validateAnalystPlan(result.plan).valid).toBe(true);
  });

  it('4b. Valid revenue_period_comparison response is accepted', async () => {
    const planner = new GeminiAnalystPlanner();
    
    const validPlan = {
      question: 'Compare Aug to Jul',
      requests: [
        {
          capability: 'revenue_period_comparison',
          params: {
            currentStartDate: '2025-08-01',
            currentEndDate: '2025-08-31',
            comparisonStartDate: '2025-07-01',
            comparisonEndDate: '2025-07-31',
          },
        },
      ],
    };

    generateContentMock.mockResolvedValue({ text: JSON.stringify(validPlan) });

    const result = await planner.plan('Compare Aug to Jul');
    expect(validateAnalystPlan(result.plan).valid).toBe(true);
  });

  it('4c. Valid multi-request root-cause response is accepted', async () => {
    const planner = new GeminiAnalystPlanner();
    
    const validPlan = {
      question: 'Why did revenue change?',
      requests: [
        {
          capability: 'revenue_period_comparison',
          params: {
            currentStartDate: '2025-08-01',
            currentEndDate: '2025-08-31',
            comparisonStartDate: '2025-07-01',
            comparisonEndDate: '2025-07-31',
          },
        },
        {
          capability: 'revenue_by_region_comparison',
          params: {
            currentStartDate: '2025-08-01',
            currentEndDate: '2025-08-31',
            comparisonStartDate: '2025-07-01',
            comparisonEndDate: '2025-07-31',
          },
        }
      ],
    };

    generateContentMock.mockResolvedValue({ text: JSON.stringify(validPlan) });

    const result = await planner.plan('Why did revenue change?');
    expect(validateAnalystPlan(result.plan).valid).toBe(true);
  });

  it('4d. Malformed response missing endDate is rejected by validateAnalystPlan()', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        question: 'Q',
        requests: [
          {
            capability: 'revenue_by_period',
            params: { startDate: '2025-08-01' }, // Missing endDate
          },
        ],
      }),
    });

    await expect(planner.plan('Q')).rejects.toThrow(/missing params.endDate/);
  });

  it('4e. Malformed comparison response missing comparison dates is rejected', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        question: 'Q',
        requests: [
          {
            capability: 'revenue_period_comparison',
            params: {
              currentStartDate: '2025-08-01',
              currentEndDate: '2025-08-31',
              comparisonStartDate: '2025-07-01'
              // missing comparisonEndDate
            },
          },
        ],
      }),
    });

    await expect(planner.plan('Q')).rejects.toThrow(/missing params.comparisonEndDate/);
  });

  it('6. Invalid capability returned by mocked Gemini -> validator rejects it', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        question: 'Q',
        requests: [
          {
            capability: 'invalid_capability',
            params: { startDate: '2025-08-01', endDate: '2025-08-31' },
          },
        ],
      }),
    });

    await expect(planner.plan('Q')).rejects.toThrow(/Plan validation failed/);
  });

  it('7. Invalid date -> validator rejects it', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        question: 'Q',
        requests: [
          {
            capability: 'revenue_by_period',
            params: { startDate: '2025-13-01', endDate: '2025-08-31' },
          },
        ],
      }),
    });

    await expect(planner.plan('Q')).rejects.toThrow(/Plan validation failed/);
  });

  it('8. Empty Gemini response -> clear error', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockResolvedValue({
      text: '',
    });

    await expect(planner.plan('Q')).rejects.toThrow('Gemini API returned an empty response.');
  });

  it('9. Gemini API failure -> error propagates with useful context', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockRejectedValue(new Error('Network error'));

    await expect(planner.plan('Q')).rejects.toThrow('Gemini API request failed: Network error');
  });

  it('10. Missing GEMINI_API_KEY -> clear configuration error', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiAnalystPlanner()).toThrow('Missing GEMINI_API_KEY environment variable');
  });

  it('11. Original user question is preserved in the returned plan', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        question: 'Gemini rewrote the question',
        requests: [],
      }),
    });

    const result = await planner.plan('Original question');
    expect(result.plan.question).toBe('Original question');
  });

  it('12. Invalid JSON returned -> fails parsing', async () => {
    const planner = new GeminiAnalystPlanner();
    
    generateContentMock.mockResolvedValue({
      text: '{ invalid_json ',
    });

    await expect(planner.plan('Q')).rejects.toThrow(/Failed to parse Gemini response as JSON/);
  });
});

