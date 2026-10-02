/**
 * Step 8 — Hidden-Event Validation
 *
 * Validates that the deterministic generator produces the intentionally
 * designed business events and behavioral patterns across all steps.
 *
 * This module does NOT generate data itself; it re-uses the existing
 * generator functions and validates their output against the frozen V1
 * business specification.
 *
 * Does NOT connect to PostgreSQL.
 */

export const VALIDATION_SEED = 20250915;

/**
 * Production-scale configuration for hidden-event validation.
 *
 * These numbers mirror the target production dataset size so that
 * probabilistic rules (seasonal weighting, shortage selection, etc.)
 * produce statistically meaningful signals.
 */
export const PRODUCTION_SCALE = {
  seed: VALIDATION_SEED,
  products: 1500,
  customers: 8000,
  orders: 200_000,
  campaigns: 45,
} as const;

