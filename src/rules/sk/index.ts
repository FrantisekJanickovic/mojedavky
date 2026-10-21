/**
 * The Slovak jurisdiction package.
 *
 * Czechia will be a sibling of this directory, not a flag inside it. The
 * entities, the parameters and the structure of the benefits all differ, so a
 * shared package would mean a country condition inside every rule and a test
 * suite nobody can read. Separate packages also mean a Czech mistake cannot
 * break Slovakia.
 */

import type { Registry } from '../../engine/simulate.js';
import { skParameters } from './parameters.js';
import { skLeads } from './leads.js';
import { pridavokNaDieta } from './benefits/pridavok-na-dieta.js';
import { prispevokNaByvanie } from './benefits/prispevok-na-byvanie.js';

export const skRegistry: Registry = {
  benefits: [pridavokNaDieta, prispevokNaByvanie],
  leads: skLeads,
  parameters: skParameters,
};

export { skParameters, skParameterDefinitions, skSources } from './parameters.js';
export { skOffices, officeFor, documentsFor } from './offices.js';
export { skLeads } from './leads.js';
