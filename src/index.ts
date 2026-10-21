/**
 * Public entry point.
 *
 * `screenSk` is pure and synchronous, which is the whole point: it runs
 * identically in a Node function and in the browser. Running it in the browser
 * means the household's income and health facts never leave the device, which
 * is both the honest design for this audience and the strongest thing the
 * product can say about itself.
 */

import { screen, type ScreenOptions } from './engine/simulate.js';
import type { ScreeningResult, Situation } from './engine/types.js';
import { skRegistry } from './rules/sk/index.js';
import { documentsFor, officeFor } from './rules/sk/offices.js';

export interface EnrichedOutcome {
  outcome: ScreeningResult['outcomes'][number];
  office: ReturnType<typeof officeFor>;
  documents: string[];
}

export interface Report extends ScreeningResult {
  /** Entitlements with the practical part attached: where, how, what to bring. */
  actionable: EnrichedOutcome[];
}

export function screenSk(situation: Situation, options?: ScreenOptions): Report {
  const result = screen(situation, skRegistry, options);

  const actionable = result.outcomes
    .filter((o) => o.status === 'eligible')
    .map((outcome) => ({
      outcome,
      office: officeFor(outcome.office),
      documents: documentsFor(outcome.benefitId),
    }));

  return { ...result, actionable };
}

export { screen } from './engine/simulate.js';
export { ParameterTable } from './engine/parameters.js';
export * from './engine/types.js';
export { skRegistry } from './rules/sk/index.js';
