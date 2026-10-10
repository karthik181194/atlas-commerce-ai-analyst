import { BusinessAnalystService } from './business-analyst.service';
import { AnalystPlanner } from './analyst-planner';
import { AnalystOrchestrator } from './analyst-orchestrator.service';
import { AnalystSynthesizer } from './analyst-synthesizer';
import { AnalystPlan, AnalystEvidence } from './analyst-orchestration.types';
import { AnalystSynthesisResult } from './analyst-synthesizer.types';
import { AnalystPlannerResult } from './analyst-planner.types';

describe('BusinessAnalystService', () => {
  let service: BusinessAnalystService;
  let plannerMock: jest.Mocked<AnalystPlanner>;
  let orchestratorMock: jest.Mocked<AnalystOrchestrator>;
  let synthesizerMock: jest.Mocked<AnalystSynthesizer>;

  beforeEach(() => {
    plannerMock = {
      plan: jest.fn(),
    };
    orchestratorMock = {
      execute: jest.fn(),
    } as any;
    synthesizerMock = {
      synthesize: jest.fn(),
    };

    service = new BusinessAnalystService(plannerMock, orchestratorMock, synthesizerMock);
  });

  it('1. Happy path: orchestrates question -> plan -> evidence -> answer', async () => {
    const question = 'Why did revenue change?';
    
    const plan: AnalystPlan = {
      question,
      requests: [{ capability: 'revenue_period_comparison', params: {} as any }],
    };
    const plannerResult: AnalystPlannerResult = { plan };
    
    const evidence: AnalystEvidence[] = [
      { capability: 'revenue_period_comparison', data: { percentageChange: '10' } }
    ];

    const synthesisResult: AnalystSynthesisResult = {
      answer: 'Revenue changed by 10%.',
    };

    plannerMock.plan.mockResolvedValue(plannerResult);
    orchestratorMock.execute.mockResolvedValue(evidence);
    synthesizerMock.synthesize.mockResolvedValue(synthesisResult);

    const result = await service.answer(question);

    expect(result.question).toBe(question);
    expect(result.answer).toBe('Revenue changed by 10%.');

    expect(plannerMock.plan).toHaveBeenCalledWith(question);
    expect(orchestratorMock.execute).toHaveBeenCalledWith(plan);
    expect(synthesizerMock.synthesize).toHaveBeenCalledWith({
      question,
      evidence,
    });
  });

  it('2. Planner failure stops execution and propagates error', async () => {
    const error = new Error('Planner failed');
    plannerMock.plan.mockRejectedValue(error);

    await expect(service.answer('Q')).rejects.toThrow('Planner failed');

    expect(orchestratorMock.execute).not.toHaveBeenCalled();
    expect(synthesizerMock.synthesize).not.toHaveBeenCalled();
  });

  it('3. Orchestrator failure stops execution and propagates error', async () => {
    plannerMock.plan.mockResolvedValue({ plan: { question: 'Q', requests: [] } });
    const error = new Error('Orchestrator failed');
    orchestratorMock.execute.mockRejectedValue(error);

    await expect(service.answer('Q')).rejects.toThrow('Orchestrator failed');

    expect(synthesizerMock.synthesize).not.toHaveBeenCalled();
  });

  it('4. Synthesizer failure stops execution and propagates error', async () => {
    plannerMock.plan.mockResolvedValue({ plan: { question: 'Q', requests: [] } });
    orchestratorMock.execute.mockResolvedValue([]);
    const error = new Error('Synthesizer failed');
    synthesizerMock.synthesize.mockRejectedValue(error);

    await expect(service.answer('Q')).rejects.toThrow('Synthesizer failed');
  });

  it('5. Empty question delegates validation to the planner', async () => {
    // We expect the facade to blindly pass the empty string to the planner,
    // and if the planner rejects it, the facade propagates it.
    const error = new Error('Question must be a non-empty string.');
    plannerMock.plan.mockRejectedValue(error);

    await expect(service.answer('')).rejects.toThrow('Question must be a non-empty string.');
    
    expect(plannerMock.plan).toHaveBeenCalledWith('');
    expect(orchestratorMock.execute).not.toHaveBeenCalled();
  });
});

