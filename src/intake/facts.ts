/**
 * The fact register.
 *
 * Every fact the system can know about a household, named once. Rules declare
 * which of them they need (`Benefit.requiredFacts`), leads declare which they
 * consult (`LeadRule.reads`), and questions declare which they supply
 * (`Question.supplies`).
 *
 * This exists because the question list and the rules had already drifted
 * apart without anything noticing. `pridavok-na-dieta` declared that it needed
 * `persons.ageYears` and compared every child's age against a ceiling — while
 * no question asked a child's age, so `toSituation` set every child to zero and
 * the comparison was always true. A dead condition, in the benefit most people
 * would use, found by reading the code rather than by any test failing.
 *
 * `tests/facts.test.ts` makes that impossible to repeat: a fact a rule needs
 * and nothing asks is a failing build, and so is a question whose answer no
 * rule reads.
 *
 * `formBasis` records where the authority's own application form asks for the
 * fact. A fact with no form basis is one we invented, which is not forbidden —
 * leads legitimately need facts no single form asks — but it is a reason to
 * look again before asking somebody for it.
 */

export interface FactDefinition {
  /** Dot path into Situation, e.g. `persons.ageYears`. */
  id: string;
  /** What it is, in one line. */
  description: string;
  /**
   * Special-category data under GDPR Art. 9. Asked only because a rule keys on
   * it, phrased as the administrative fact rather than the condition.
   */
  sensitive?: boolean;
  /**
   * Where an authority's own form asks for this, so the question can be
   * justified by something other than our own judgement.
   */
  formBasis?: string;
}

const PND_FORM = '600/2003 žiadosť o prídavok na dieťa';

export const facts: FactDefinition[] = [
  // --- Who is in the household -------------------------------------------
  {
    id: 'persons.role',
    description: 'Whether each person is the applicant, a partner, a child or other.',
    formBasis: `${PND_FORM}, časť E — Pomer dieťaťa k žiadateľovi; časť G — Druhá oprávnená osoba`,
  },
  {
    id: 'persons.ageYears',
    description: 'Age in whole years at the start of the assessed period.',
    formBasis: `${PND_FORM}, časť A and E — Dátum narodenia`,
  },
  {
    id: 'persons.isDependentChild',
    description: 'Child is still in qualifying education and not yet self-supporting.',
    // The form does not ask this as a yes/no. It asks which school the child
    // attends, and the office derives dependency from that. We ask the
    // conclusion because a screening cannot verify an enrolment — which is
    // also why this benefit stays draft.
    formBasis: `${PND_FORM}, časť E — Škola, ktorú navštevuje`,
  },

  // --- Money ---------------------------------------------------------------
  {
    id: 'persons.incomeMonthly',
    description: 'Gross monthly income in EUR from all sources.',
    // Deliberately NOT on the child allowance form: that benefit has no income
    // test. This comes from the material-need assessment instead.
    formBasis: '417/2013 — posúdenie hmotnej núdze',
  },

  // --- Status --------------------------------------------------------------
  {
    id: 'persons.isStudent',
    description: 'In full-time study.',
    formBasis: `${PND_FORM}, časť C — Sociálne postavenie žiadateľa`,
  },
  {
    id: 'persons.isPensioner',
    description: 'Drawing a pension.',
    formBasis: `${PND_FORM}, časť C — Sociálne postavenie žiadateľa`,
  },
  {
    id: 'persons.isOnParentalLeave',
    description: 'Personally and full-time caring for a child.',
    formBasis: `${PND_FORM}, časť C — Sociálne postavenie žiadateľa`,
  },
  {
    id: 'persons.isRegisteredJobseeker',
    description: 'Registered as a jobseeker with the labour office.',
    formBasis: `${PND_FORM}, časť C — Sociálne postavenie žiadateľa`,
  },

  // --- Health, as the administrative fact the law keys on ------------------
  {
    id: 'persons.hasDisabilityCard',
    description: 'Holds a certified disability card (ŤZP).',
    sensitive: true,
    formBasis: '447/2008 — posudok na účely kompenzácií',
  },
  {
    id: 'persons.hasCertifiedLongTermIllness',
    description: "A child's long-term adverse health condition is certified.",
    sensitive: true,
    // Asked on the child allowance form itself, which is the justification for
    // asking it here: the authority needs it to decide, so a screening that
    // skipped it would be screening a different benefit.
    formBasis: `${PND_FORM}, časť E — Dieťa s dlhodobo nepriaznivým zdravotným stavom`,
  },

  // --- Housing -------------------------------------------------------------
  {
    id: 'household.tenure',
    description: 'How the household occupies its home.',
    formBasis: '417/2013 — príspevok na bývanie',
  },
  {
    id: 'household.housingCostMonthly',
    description: 'Monthly housing cost in EUR.',
    formBasis: '417/2013 — príspevok na bývanie',
  },
];

const byId = new Map(facts.map((f) => [f.id, f]));

export function isKnownFact(id: string): boolean {
  return byId.has(id);
}

export function fact(id: string): FactDefinition {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown fact: ${id}`);
  return found;
}

export function isSensitive(id: string): boolean {
  return byId.get(id)?.sensitive === true;
}
