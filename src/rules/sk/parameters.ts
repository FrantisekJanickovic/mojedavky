/**
 * Slovak parameters, loaded from the compiled rule pack.
 *
 * The numbers are NOT here. They live in `rules/sk/parameters.yaml`, which
 * `npm run rules` validates and compiles into `generated/parameters.json`.
 * This file only adapts that pack to the engine's types.
 *
 * The split exists so that checking a figure against a decree does not require
 * reading TypeScript. Whoever verifies the law edits the YAML; the diff shows
 * exactly which number moved and who signed for it.
 *
 * EVERY value is still `verified: false`, and six of the eight are literal
 * placeholders. In production the engine therefore refuses to answer with any
 * of them — see the two gates in `src/engine/simulate.ts`.
 */

import { ParameterTable, type ParameterDefinition } from '../../engine/parameters.js';
import pack from './generated/parameters.json';

/**
 * The cast is earned by two things that run before this file is ever reached:
 * `scripts/compile-rules.mjs` validates the YAML and refuses to emit a pack
 * that does not match this shape, and `tests/rules-pack.test.ts` recompiles
 * the YAML and fails if the committed JSON differs from it. Re-validating here
 * would put the same checks in the browser bundle for no gain.
 */
export const skParameterDefinitions = pack.parameters as unknown as ParameterDefinition[];

export const skParameters = new ParameterTable(skParameterDefinitions);

/** Which pack answered, so a screening can be reproduced later. */
export const skRulePackVersion = pack.version;

function sourceUrl(key: string): string {
  const source = (pack.sources as Record<string, { title: string; url: string } | undefined>)[key];
  if (!source) {
    throw new Error(`Rule pack ${pack.version} has no source "${key}"`);
  }
  return source.url;
}

/**
 * Named sources for the benefits to cite in their trace.
 *
 * These are resolved through the pack rather than written out again, so a
 * corrected link in the YAML reaches the reasoning shown to the person too.
 */
export const skSources = {
  act600: sourceUrl('act-600-2003'),
  act601: sourceUrl('act-601-2003'),
  act417: sourceUrl('act-417-2013'),
};
