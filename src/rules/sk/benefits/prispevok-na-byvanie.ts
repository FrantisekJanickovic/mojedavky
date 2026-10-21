/**
 * Housing allowance within material-need assistance (príspevok na bývanie)
 * — zákon č. 417/2013 Z. z.
 *
 * This is the one with the large unclaimed gap, and also the one whose rules
 * are genuinely involved: the income test runs against the household's
 * subsistence minimum, the household composition is defined per benefit, and
 * several further components interact with it.
 *
 * MATURITY: draft, and more obviously so than the child allowance. What is
 * modelled here is the shape of the test — a composition-dependent subsistence
 * figure compared against income — not the full statutory logic. Among the
 * things it does NOT yet express: the treatment of assets, the components that
 * attach to material need (protection and activation supplements), the
 * conditions on proving a tenure relationship, and the exclusions.
 *
 * It is included at this stage to prove the engine can carry a means-tested
 * benefit with a shared parameter, not to answer anybody's question.
 */

import type { Benefit, EvaluationContext } from '../../../engine/types.js';
import { skSources } from '../parameters.js';

export const prispevokNaByvanie: Benefit = {
  id: 'sk-prispevok-na-byvanie',
  name: 'Príspevok na bývanie',
  law: 'zákon č. 417/2013 Z. z.',
  office: 'upsvar',
  maturity: 'draft',
  requiredFacts: [
    'household.tenure',
    'household.housingCostMonthly',
    'persons.incomeMonthly',
  ],

  evaluate(ctx: EvaluationContext) {
    const { household, persons } = ctx.situation;

    if (household.tenure === undefined) {
      ctx.missing('household.tenure');
    }
    if (household.housingCostMonthly === undefined) {
      ctx.missing('household.housingCostMonthly');
    }
    if (persons.some((p) => p.incomeMonthly === undefined)) {
      ctx.missing('persons.incomeMonthly');
    }

    // Subsistence minimum for this composition: the first adult counts at the
    // full rate, further adults and children at their own rates.
    const adults = persons.filter((p) => p.role !== 'child');
    const children = ctx.children();

    const firstAdult = ctx.param('zivotne-minimum.jedna-plnoleta-osoba');
    const furtherAdult = ctx.param('zivotne-minimum.dalsia-plnoleta-osoba');
    const perChild = ctx.param('zivotne-minimum.nezaopatrene-dieta');

    const subsistence =
      (adults.length > 0 ? firstAdult : 0) +
      Math.max(0, adults.length - 1) * furtherAdult +
      children.length * perChild;

    ctx.trace({
      rule: 'zivotne-minimum-domacnosti',
      detail: `Subsistence minimum for ${adults.length} adult(s) and ${children.length} child(ren).`,
      value: subsistence,
      source: skSources.act601,
    });

    const income = ctx.householdIncomeMonthly();

    ctx.trace({
      rule: 'prijem-domacnosti',
      detail: 'Total monthly household income from all members.',
      value: income,
      source: skSources.act417,
    });

    const inMaterialNeed = income < subsistence;

    ctx.trace({
      rule: 'hmotna-nudza',
      detail: inMaterialNeed
        ? 'Income is below the household subsistence minimum, so material need arises on this test alone.'
        : 'Income reaches the household subsistence minimum, so this test does not establish material need.',
      value: inMaterialNeed,
      source: skSources.act417,
    });

    if (!inMaterialNeed) {
      return { eligible: false };
    }

    const amount =
      persons.length > 1
        ? ctx.param('byvanie.prispevok-viac-osob')
        : ctx.param('byvanie.prispevok-jedna-osoba');

    ctx.trace({
      rule: 'vyska-prispevku',
      detail: `Rate for a household of ${persons.length}.`,
      value: amount,
      source: skSources.act417,
    });

    return { eligible: true, amountMonthly: amount };
  },
};
