/**
 * Deterministic seeded PRNG (mulberry32). The numeric state is the entire
 * source of randomness for a save, so persisting `state` and reusing the
 * same call order reproduces the same simulation exactly.
 */
export interface RngState {
  state: number;
}

export function createRng(seed: number): RngState {
  return { state: seed >>> 0 };
}

/** Advances the RNG and returns a float in [0, 1). Mutates state in place. */
export function nextFloat(rng: RngState): number {
  rng.state |= 0;
  rng.state = (rng.state + 0x6d2b79f5) | 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

export function nextInt(rng: RngState, min: number, maxInclusive: number): number {
  return Math.floor(nextRange(rng, min, maxInclusive + 1));
}

/** Standard-normal-ish sample via sum of uniforms (Irwin-Hall approximation). */
export function nextNormal(rng: RngState, mean: number, stdDev: number): number {
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += nextFloat(rng);
  const z = sum - 3; // roughly N(0,1)
  return mean + z * stdDev;
}

export function pick<T>(rng: RngState, items: readonly T[]): T {
  return items[nextInt(rng, 0, items.length - 1)];
}

export function chance(rng: RngState, probability: number): boolean {
  return nextFloat(rng) < probability;
}

export function weightedPick<T>(rng: RngState, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let roll = nextFloat(rng) * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}
