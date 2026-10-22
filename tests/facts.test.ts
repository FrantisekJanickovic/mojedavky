/**
 * The fact register is only worth having if it is enforced.
 *
 * These tests are the enforcement. They exist because the questions and the
 * rules had already drifted apart with nothing noticing: `pridavok-na-dieta`
 * declared it needed `persons.ageYears` and compared each child's age against
 * a ceiling, while no question asked an age — so every child arrived as nought
 * and the ceiling never bound on anybody. Nothing failed. The benefit simply
 * gave a wrong answer, confidently.
 *
 * Each test below turns one way of repeating that into a red build.
 */

import { describe, expect, it } from 'vitest';
import { facts, isKnownFact, isSensitive } from '../src/intake/facts.js';
import {
  skQuestions,
  relevantQuestions,
  toSituation,
  repeatedId,
  type Answers,
} from '../src/intake/questions.js';
import { skRegistry } from '../src/rules/sk/index.js';
import { screen } from '../src/engine/simulate.js';

const registered = new Set(facts.map((f) => f.id));

const supplied = new Set(skQuestions.flatMap((q) => q.supplies));

const consumed = new Set([
  ...skRegistry.benefits.flatMap((b) => b.requiredFacts),
  ...skRegistry.leads.flatMap((l) => l.reads),
]);

describe('the register is the single vocabulary', () => {
  it('has no duplicate ids', () => {
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
  });

  it('every fact a benefit requires is registered', () => {
    for (const benefit of skRegistry.benefits) {
      for (const id of benefit.requiredFacts) {
        expect(isKnownFact(id), `${benefit.id} requires unregistered fact ${id}`).toBe(true);
      }
    }
  });

  it('every fact a lead reads is registered', () => {
    for (const lead of skRegistry.leads) {
      for (const id of lead.reads) {
        expect(isKnownFact(id), `${lead.id} reads unregistered fact ${id}`).toBe(true);
      }
    }
  });

  it('every fact a question supplies is registered', () => {
    for (const question of skQuestions) {
      for (const id of question.supplies) {
        expect(isKnownFact(id), `${question.id} supplies unregistered fact ${id}`).toBe(true);
      }
    }
  });
});

describe('nothing is needed that nobody asks', () => {
  // The exact failure that let the age ceiling die.
  it('every registered fact is supplied by some question', () => {
    const orphans = [...registered].filter((id) => !supplied.has(id));
    expect(orphans, `no question supplies: ${orphans.join(', ')}`).toEqual([]);
  });

  it('every fact a benefit requires is supplied by some question', () => {
    for (const benefit of skRegistry.benefits) {
      for (const id of benefit.requiredFacts) {
        expect(supplied.has(id), `${benefit.id} needs ${id}, which no question asks`).toBe(true);
      }
    }
  });

  it('every fact a lead reads is supplied by some question', () => {
    // A lead depending on a fact nobody asks would never fire — the least
    // visible way for this product to fail, because it looks like a household
    // that simply had no leads.
    for (const lead of skRegistry.leads) {
      for (const id of lead.reads) {
        expect(supplied.has(id), `${lead.id} reads ${id}, which no question asks`).toBe(true);
      }
    }
  });
});

describe('nothing is asked that nobody reads', () => {
  it('every registered fact is consumed by a benefit or a lead', () => {
    const unused = [...registered].filter((id) => !consumed.has(id));
    expect(unused, `nothing reads: ${unused.join(', ')}`).toEqual([]);
  });

  it('every question supplies at least one fact', () => {
    for (const question of skQuestions) {
      expect(question.supplies.length, `${question.id} supplies nothing`).toBeGreaterThan(0);
    }
  });
});

describe('special-category data', () => {
  it('a question supplying a sensitive fact is itself marked sensitive', () => {
    // The flag is what lets the UI say why it is being asked. A sensitive fact
    // collected through an unflagged question is asked silently.
    for (const question of skQuestions) {
      if (question.supplies.some(isSensitive)) {
        expect(question.sensitive, `${question.id} supplies sensitive data unflagged`).toBe(true);
      }
    }
  });

  it('is asked only where a benefit or lead actually reads it', () => {
    for (const definition of facts) {
      if (!definition.sensitive) continue;
      expect(
        consumed.has(definition.id),
        `${definition.id} is special-category data that nothing reads`,
      ).toBe(true);
    }
  });
});

// --- the regression itself -------------------------------------------------

function answers(overrides: Answers = {}): Answers {
  return {
    children_count: 1,
    tenure: 'owner',
    household_income: 1200,
    children_dependent: 'yes',
    applicant_status: 'employed',
    partner: 'no',
    disability_card: 'no',
    child_long_term_illness: 'no',
    ...overrides,
  };
}

function childAllowance(a: Answers) {
  const situation = toSituation(a, '2026-03');
  const result = screen(situation, skRegistry, { mode: 'development' });
  const outcome = result.outcomes.find((o) => o.benefitId === 'sk-pridavok-na-dieta');
  if (!outcome) throw new Error('child allowance outcome missing');
  return outcome;
}

describe("a child's age reaches the rule", () => {
  it('carries the answered age into the situation', () => {
    const situation = toSituation(answers({ [repeatedId('child_age', 1)]: 8 }), '2026-03');
    const child = situation.persons.find((p) => p.role === 'child');
    expect(child?.ageYears).toBe(8);
  });

  it('invents no age for adults, since no rule reads one', () => {
    const situation = toSituation(answers({ [repeatedId('child_age', 1)]: 8 }), '2026-03');
    for (const person of situation.persons.filter((p) => p.role !== 'child')) {
      expect(person.ageYears).toBeUndefined();
    }
  });

  it('a child under the ceiling qualifies', () => {
    expect(childAllowance(answers({ [repeatedId('child_age', 1)]: 8 })).status).toBe('eligible');
  });

  it('a child over the ceiling does not', () => {
    // Before the age question existed this returned 'eligible': every child
    // was nought, and nought is under every ceiling.
    expect(childAllowance(answers({ [repeatedId('child_age', 1)]: 27 })).status).toBe(
      'not-eligible',
    );
  });

  it('an unanswered age is missing information, not a refusal', () => {
    const outcome = childAllowance(answers());
    expect(outcome.status).toBe('needs-more-info');
    expect(outcome.missingFacts).toContain('persons.child-1.ageYears');
  });

  it('asks one age question per child, oldest first', () => {
    const ages = relevantQuestions({ children_count: 3 }).filter((q) =>
      q.id.startsWith('child_age'),
    );
    expect(ages).toHaveLength(3);
    expect(ages[0]?.label).toContain('najstaršie');
    expect(ages[1]?.label).toContain('2. najstaršie');
  });
});
