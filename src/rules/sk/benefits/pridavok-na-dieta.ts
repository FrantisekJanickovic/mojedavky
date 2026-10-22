/**
 * Child allowance (prídavok na dieťa) — zákon č. 600/2003 Z. z.
 *
 * The simplest shape there is: a flat amount per dependent child, with no
 * income test. It is here first precisely because it is simple — it exercises
 * the whole pipeline (facts, parameters, trace, office, verification gate)
 * without the rules getting in the way.
 *
 * MATURITY: draft. The age and dependency conditions below are a first pass
 * from the act's structure and have NOT been reviewed by anyone who knows the
 * practice. In particular the definition of "nezaopatrené dieťa" carries
 * exceptions this model does not yet express.
 */

import type { Benefit, EvaluationContext } from '../../../engine/types.js';
import { skSources } from '../parameters.js';

export const pridavokNaDieta: Benefit = {
  id: 'sk-pridavok-na-dieta',
  name: 'Prídavok na dieťa',
  law: 'zákon č. 600/2003 Z. z.',
  office: 'upsvar',
  maturity: 'draft',
  requiredFacts: ['persons.role', 'persons.ageYears', 'persons.isDependentChild'],

  evaluate(ctx: EvaluationContext) {
    const children = ctx.children();

    if (children.length === 0) {
      ctx.trace({
        rule: 'ma-dieta',
        detail: 'There is no child in the household, so the allowance cannot arise.',
        value: false,
        source: skSources.act600,
      });
      return { eligible: false };
    }

    const maxAge = ctx.param('pridavok.vek-max');
    const perChild = ctx.param('pridavok.zakladna-suma');

    const qualifying = children.filter((child) => {
      // An unanswered question is not a "no". Treating silence as a refusal is
      // how a screening tool quietly tells people they get nothing, so both
      // unknowns below are recorded as missing facts instead.
      if (child.isDependentChild === undefined) {
        ctx.missing(`persons.${child.id}.isDependentChild`);
        return false;
      }
      if (child.ageYears === undefined) {
        ctx.missing(`persons.${child.id}.ageYears`);
        return false;
      }
      return child.isDependentChild && child.ageYears < maxAge;
    });

    ctx.trace({
      rule: 'nezaopatrene-deti',
      detail: `${qualifying.length} of ${children.length} children in the household qualify as dependent and under ${maxAge}.`,
      value: qualifying.length,
      source: skSources.act600,
    });

    if (qualifying.length === 0) {
      return { eligible: false };
    }

    const amount = qualifying.length * perChild;

    ctx.trace({
      rule: 'vypocet',
      detail: `${qualifying.length} × ${perChild.toFixed(2)} EUR per child per month.`,
      value: amount,
      source: skSources.act600,
    });

    return { eligible: true, amountMonthly: amount };
  },
};
