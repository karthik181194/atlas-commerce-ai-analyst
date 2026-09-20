/**
 * Seeded xorshift32 pseudo-random number generator.
 *
 * This is deterministic by design: the same seed always produces the same
 * sequence. It is not suitable for cryptographic use.
 */
export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new Error('The generator seed must be an integer.');
    }

    this.state = seed >>> 0;

    // xorshift32 cannot use zero as its internal state.
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;

    return this.state;
  }

  nextInt(minimum: number, maximum: number): number {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) {
      throw new Error('Integer bounds are required.');
    }

    if (minimum > maximum) {
      throw new Error('The minimum cannot be greater than the maximum.');
    }

    const range = maximum - minimum + 1;
    return minimum + (this.nextUint32() % range);
  }
}
