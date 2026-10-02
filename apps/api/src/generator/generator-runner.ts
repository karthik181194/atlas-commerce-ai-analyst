import { ACTIVE_DATASET } from './generator.config';
import { DeterministicRandom } from './deterministic-random';

const SAMPLE_VALUE_COUNT = 5;

export function generateTestValues(
  seed: number = ACTIVE_DATASET.seed,
): number[] {
  const random = new DeterministicRandom(seed);

  return Array.from({ length: SAMPLE_VALUE_COUNT }, () => random.nextInt(0, 999));
}

export function formatGeneratorOutput(
  seed: number = ACTIVE_DATASET.seed,
): string {
  const values = generateTestValues(seed);

  return [`Seed: ${seed}`, `Generated values: ${values.join(', ')}`].join('\n');
}
