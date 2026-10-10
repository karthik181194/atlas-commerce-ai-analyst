import { AnalystEvidence } from './analyst-orchestration.types';

export interface AnalystSynthesisRequest {
  question: string;
  evidence: AnalystEvidence[];
}

export interface AnalystSynthesisResult {
  answer: string;
}

