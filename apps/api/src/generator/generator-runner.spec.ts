import { DeterministicRandom } from './deterministic-random';
import { DEVELOPMENT_DATASET } from './generator.config';
import { formatGeneratorOutput, generateTestValues } from './generator-runner';

describe('generator foundation', () => {
  it('produces identical output when run twice with the configured seed', () => {
    const firstRun = formatGeneratorOutput(DEVELOPMENT_DATASET.seed);
    const secondRun = formatGeneratorOutput(DEVELOPMENT_DATASET.seed);

    expect(secondRun).toBe(firstRun);
  });

  it('produces a different sequence for a different seed', () => {
    expect(generateTestValues(DEVELOPMENT_DATASET.seed + 1)).not.toEqual(
      generateTestValues(DEVELOPMENT_DATASET.seed),
    );
  });

  it('replays the same sequence from separate random instances', () => {
    const firstRandom = new DeterministicRandom(DEVELOPMENT_DATASET.seed);
    const secondRandom = new DeterministicRandom(DEVELOPMENT_DATASET.seed);

    const firstSequence = Array.from({ length: 5 }, () => firstRandom.nextUint32());
    const secondSequence = Array.from(
      { length: 5 },
      () => secondRandom.nextUint32(),
    );

    expect(secondSequence).toEqual(firstSequence);
  });
});
