import { AnalystSynthesizer } from './analyst-synthesizer';
import { AnalystSynthesisRequest, AnalystSynthesisResult } from './analyst-synthesizer.types';

export class DeterministicAnalystSynthesizer implements AnalystSynthesizer {
  async synthesize(request: AnalystSynthesisRequest): Promise<AnalystSynthesisResult> {
    const { question, evidence } = request;

    if (!evidence || evidence.length === 0) {
      return { answer: 'No evidence provided to synthesize an answer.' };
    }

    if (question === 'Show August 2025 revenue') {
      const data = evidence[0]?.data as any;
      if (!data) return { answer: 'Missing data for August 2025 revenue.' };
      
      const rev = data.netRevenue ?? '0.00';
      return { answer: `The revenue for August 2025 was $${rev}.` };
    } 
    
    if (question === 'Compare August 2025 revenue with July 2025') {
      const data = evidence[0]?.data as any;
      if (!data) return { answer: 'Missing comparison data.' };
      
      const current = data.currentNetRevenue ?? '0.00';
      const previous = data.comparisonNetRevenue ?? '0.00';
      const pct = data.percentageChange ?? '0.00';
      
      return { answer: `August 2025 revenue was $${current}, compared to $${previous} in July 2025 (a change of ${pct}%).` };
    } 
    
    if (question === 'Why did August 2025 revenue change?') {
      const periodComp = evidence.find((e: any) => e.capability === 'revenue_period_comparison')?.data as any;
      const regionComp = evidence.find((e: any) => e.capability === 'revenue_by_region_comparison')?.data as any;
      const categoryComp = evidence.find((e: any) => e.capability === 'revenue_by_category_comparison')?.data as any;

      if (!periodComp || !regionComp || !categoryComp) {
         return { answer: 'Incomplete evidence to explain the revenue change.' };
      }

      const current = periodComp.currentNetRevenue ?? '0.00';
      const pct = periodComp.percentageChange ?? '0.00';

      const regions = Array.isArray(regionComp) 
          ? regionComp.map((r: any) => `${r.region} (${r.percentageChange}%)`).join(', ')
          : '';

      const categories = Array.isArray(categoryComp) 
          ? categoryComp.map((c: any) => `${c.category} (${c.percentageChange}%)`).join(', ')
          : '';

      return { answer: `Revenue changed by ${pct}% to $${current}. Regional changes were: ${regions}. Category changes were: ${categories}.` };
    }

    throw new Error(`Unsupported question for deterministic synthesis: "${question}"`);
  }
}
