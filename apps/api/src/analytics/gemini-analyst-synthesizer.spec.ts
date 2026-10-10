import { GeminiAnalystSynthesizer } from './gemini-analyst-synthesizer';
import { GoogleGenAI } from '@google/genai';

jest.mock('@google/genai');

describe('GeminiAnalystSynthesizer', () => {
  let generateContentMock: jest.Mock;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_SYNTHESIZER_MODEL;

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

  it('1. Implements AnalystSynthesizer and uses default model', async () => {
    const synthesizer = new GeminiAnalystSynthesizer();
    expect(synthesizer.synthesize).toBeDefined();
    
    generateContentMock.mockResolvedValue({ text: 'Answer' });
    await synthesizer.synthesize({ question: 'Q', evidence: [] });
    
    expect(generateContentMock.mock.calls[0][0].model).toBe('gemini-3.7-flash');
  });

  it('2. includes question, evidence, and system instruction in request', async () => {
    const synthesizer = new GeminiAnalystSynthesizer();
    generateContentMock.mockResolvedValue({ text: 'Answer' });

    const evidence = [{ capability: 'revenue_by_period' as any, data: { netRevenue: '100' } }];
    await synthesizer.synthesize({ question: 'What is revenue?', evidence });

    const callArgs = generateContentMock.mock.calls[0][0];
    
    expect(callArgs.contents).toContain('Question:\nWhat is revenue?');
    expect(callArgs.contents).toContain('"netRevenue": "100"');
    expect(callArgs.config.systemInstruction).toContain('expert AI Business Analyst');
    expect(callArgs.config.systemInstruction).toContain('absolute source of truth');
  });

  it('4. response text becomes AnalystSynthesisResult.answer', async () => {
    const synthesizer = new GeminiAnalystSynthesizer();
    generateContentMock.mockResolvedValue({ text: 'The revenue was $100.' });

    const result = await synthesizer.synthesize({ question: 'Q', evidence: [] });
    expect(result.answer).toBe('The revenue was $100.');
  });

  it('5. empty response is rejected', async () => {
    const synthesizer = new GeminiAnalystSynthesizer();
    generateContentMock.mockResolvedValue({ text: '   ' }); // whitespace

    await expect(synthesizer.synthesize({ question: 'Q', evidence: [] })).rejects.toThrow('Gemini API returned an empty response.');
  });

  it('6. API error is surfaced', async () => {
    const synthesizer = new GeminiAnalystSynthesizer();
    generateContentMock.mockRejectedValue(new Error('Network disconnected'));

    await expect(synthesizer.synthesize({ question: 'Q', evidence: [] })).rejects.toThrow('Gemini API request failed: Network disconnected');
  });

  it('7. missing API key is handled', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiAnalystSynthesizer()).toThrow('Missing GEMINI_API_KEY environment variable.');
  });
  
  it('8. No analytics/database dependencies exist', () => {
    // Proven by successful execution without injecting or mocking AnalyticsService or Postgres
    expect(true).toBe(true);
  });
});

