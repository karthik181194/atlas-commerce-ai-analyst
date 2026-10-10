import { GoogleGenAI } from '@google/genai';
import { AnalystSynthesizer } from './analyst-synthesizer';
import { AnalystSynthesisRequest, AnalystSynthesisResult } from './analyst-synthesizer.types';

export class GeminiAnalystSynthesizer implements AnalystSynthesizer {
  private client: GoogleGenAI;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY environment variable. The Gemini Analyst Synthesizer requires an API key to function.');
    }

    this.client = new GoogleGenAI({ apiKey });
    this.modelName = process.env.GEMINI_SYNTHESIZER_MODEL ?? 'gemini-3.7-flash';
  }

  async synthesize(request: AnalystSynthesisRequest): Promise<AnalystSynthesisResult> {
    if (!request.question || request.question.trim() === '') {
      throw new Error('Question must be a non-empty string.');
    }

    const systemInstruction = `
You are an expert AI Business Analyst. Your role is to answer the user's business question using ONLY the provided analytical evidence.

CRITICAL RULES:
1. The provided evidence is the absolute source of truth. You must use the exact numbers provided.
2. Treat supplied derived metrics and percentages as authoritative.
3. NEVER recalculate a percentage, AOV, absolute change, rate, or other derived metric from underlying values when that metric is already present in the evidence. Do not substitute a model-calculated value for a supplied analytical metric.
4. Preserve supplied numeric values exactly, subject only to human-readable formatting such as currency symbols or sensible decimal display.
5. Atlas Commerce monetary values are in INR. When presenting monetary values to the user, use the ₹ symbol rather than $. Do not convert INR values to another currency. Percentages, order counts, and other non-monetary metrics should remain unchanged.
6. Do NOT invent, guess, or calculate numbers that are not supported by the evidence.
7. Clearly distinguish between observed facts (what the data shows) and potential causal explanations. Do not claim causality unless the evidence directly proves it.
8. If the provided evidence is insufficient to fully answer the question, state clearly what is missing or unknown.
9. Provide a concise, professional business summary.
10. Do NOT output raw JSON dumps.
11. Do NOT mention internal system implementation details (e.g., "capabilities", "database", "SQL", "router").
12. Focus strictly on providing decision-relevant insights that directly answer the user's question.
`;

    const prompt = `Question:\n${request.question}\n\nEvidence Data:\n${JSON.stringify(request.evidence, null, 2)}`;

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction,
        },
      });
    } catch (error: any) {
      throw new Error(`Gemini API request failed: ${error.message}`);
    }

    const answer = response.text;
    if (!answer || answer.trim() === '') {
      throw new Error('Gemini API returned an empty response.');
    }

    return { answer };
  }
}

