/**
 * Slovak parameters.
 *
 * EVERY value here is `verified: false` and was transcribed from a secondary
 * source as a starting point. None of it has been checked against the official
 * text, so in production the engine refuses to answer with any of it. That is
 * deliberate: a plausible-looking wrong amount is worse than no amount.
 *
 * To verify one, open its `source`, confirm every value and commencement date,
 * then set `verified: true` and fill in `verifiedBy` / `verifiedOn`. Do it one
 * parameter at a time and add a test case for each — see `tests/cases`.
 *
 * Note which document to trust: the act fixes the entitlement, but the amounts
 * are set by decree (opatrenie / nariadenie vlády) and re-set most years, often
 * from 1 January or 1 July. The act alone will not give you the current number.
 */

import { ParameterTable, type ParameterDefinition } from '../../engine/parameters.js';

const SLOV_LEX_600_2003 = 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/600/';
const SLOV_LEX_417_2013 = 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2013/417/';
const SLOV_LEX_601_2003 = 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/601/';
const UPSVAR_TABLE = 'https://www.upsvr.gov.sk/socialne-veci-a-rodina/statne-socialne-davky/';

export const skParameterDefinitions: ParameterDefinition[] = [
  {
    path: 'pridavok.zakladna-suma',
    description: 'Monthly child allowance per dependent child (prídavok na dieťa).',
    source: SLOV_LEX_600_2003,
    verified: false,
    values: [
      // TRANSCRIBED, UNCHECKED. Confirm against the decree in force, not the act.
      { from: '2026-01-01', value: 30.0 },
    ],
  },
  {
    path: 'pridavok.priplatok',
    description:
      'Supplement to the child allowance where no parent can claim the child tax bonus (príplatok k prídavku na dieťa).',
    source: SLOV_LEX_600_2003,
    verified: false,
    values: [{ from: '2026-01-01', value: 0.0 }], // PLACEHOLDER — must be filled in.
  },
  {
    path: 'pridavok.vek-max',
    description: 'Upper age limit for a dependent child, in whole years.',
    source: SLOV_LEX_600_2003,
    verified: false,
    values: [{ from: '2026-01-01', value: 25 }],
  },
  {
    path: 'zivotne-minimum.jedna-plnoleta-osoba',
    description: 'Subsistence minimum for one adult per month (životné minimum).',
    source: SLOV_LEX_601_2003,
    verified: false,
    values: [{ from: '2026-07-01', value: 0.0 }], // PLACEHOLDER — re-set annually, usually from 1 July.
  },
  {
    path: 'zivotne-minimum.dalsia-plnoleta-osoba',
    description: 'Subsistence minimum for each further jointly assessed adult.',
    source: SLOV_LEX_601_2003,
    verified: false,
    values: [{ from: '2026-07-01', value: 0.0 }], // PLACEHOLDER.
  },
  {
    path: 'zivotne-minimum.nezaopatrene-dieta',
    description: 'Subsistence minimum for each dependent child.',
    source: SLOV_LEX_601_2003,
    verified: false,
    values: [{ from: '2026-07-01', value: 0.0 }], // PLACEHOLDER.
  },
  {
    path: 'byvanie.prispevok-jedna-osoba',
    description: 'Housing allowance within material-need assistance, single-person household.',
    source: SLOV_LEX_417_2013,
    verified: false,
    values: [{ from: '2026-01-01', value: 0.0 }], // PLACEHOLDER.
  },
  {
    path: 'byvanie.prispevok-viac-osob',
    description: 'Housing allowance within material-need assistance, household of two or more.',
    source: SLOV_LEX_417_2013,
    verified: false,
    values: [{ from: '2026-01-01', value: 0.0 }], // PLACEHOLDER.
  },
];

export const skParameters = new ParameterTable(skParameterDefinitions);

export const skSources = {
  act600: SLOV_LEX_600_2003,
  act417: SLOV_LEX_417_2013,
  act601: SLOV_LEX_601_2003,
  upsvarTable: UPSVAR_TABLE,
};
