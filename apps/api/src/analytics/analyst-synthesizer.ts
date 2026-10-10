import { AnalystSynthesisRequest, AnalystSynthesisResult } from './analyst-synthesizer.types';

export interface AnalystSynthesizer {
  synthesize(
    request: AnalystSynthesisRequest,
  ): Promise<AnalystSynthesisResult>;
}

