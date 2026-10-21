import { describe, expect, it } from 'vitest';
import {
  canScreen,
  nextQuestion,
  nextQuestions,
  progress,
  skQuestions,
  toSituation,
  type Answers,
} from '../src/intake/questions.js';

describe('the flow asks what eliminates, first', () => {
  it('opens with the child count', () => {
    expect(nextQuestion({})!.id).toBe('children_count');
  });

  it('orders by how much a question narrows things down', () => {
    const weights = nextQuestions({}).map((q) => q.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it('never re-asks something already answered', () => {
    const answers: Answers = { children_count: 2 };
    expect(nextQuestions(answers).map((q) => q.id)).not.toContain('children_count');
  });
});

describe('irrelevant branches are never shown', () => {
  it('asks nothing about children when there are none', () => {
    const ids = nextQuestions({ children_count: 0 }).map((q) => q.id);
    expect(ids).not.toContain('children_dependent');
    expect(ids).not.toContain('child_long_term_illness');
  });

  it('asks about children when there are some', () => {
    const ids = nextQuestions({ children_count: 2 }).map((q) => q.id);
    expect(ids).toContain('children_dependent');
    expect(ids).toContain('child_long_term_illness');
  });

  it('asks nothing about a partner income without a partner', () => {
    const ids = nextQuestions({ partner: 'no' }).map((q) => q.id);
    expect(ids).not.toContain('partner_income');
  });

  it('asks for the housing cost only once the tenure is known', () => {
    expect(nextQuestions({}).map((q) => q.id)).not.toContain('housing_cost');
    expect(nextQuestions({ tenure: 'tenant' }).map((q) => q.id)).toContain('housing_cost');
  });
});

describe('the flow is short', () => {
  it('a single pensioner answers five questions, not eleven', () => {
    const answers: Answers = {
      children_count: 0,
      tenure: 'owner',
      household_income: 520,
      applicant_status: 'pensioner',
      partner: 'no',
    };
    // Housing cost and the disability card remain offerable but optional.
    expect(canScreen(answers)).toBe(true);
    expect(Object.keys(answers)).toHaveLength(5);
    expect(skQuestions.length).toBeGreaterThan(8);
  });

  it('refuses to screen while a required answer is missing', () => {
    expect(canScreen({ children_count: 0 })).toBe(false);
  });

  it('progress counts only relevant questions', () => {
    const withKids = progress({ children_count: 3 });
    const without = progress({ children_count: 0 });
    // Saying "no children" must make the bar jump forward, not leave dead
    // child questions sitting in the denominator.
    expect(without.total).toBeLessThan(withKids.total);
  });
});

describe('sensitive questions are marked and explained', () => {
  const sensitive = skQuestions.filter((q) => q.sensitive);

  it('there are exactly the two health-adjacent ones', () => {
    expect(sensitive.map((q) => q.id).sort()).toEqual([
      'child_long_term_illness',
      'disability_card',
    ]);
  });

  it('each says why it is being asked', () => {
    for (const q of sensitive) {
      expect(q.help, `${q.id} has no explanation`).toBeTruthy();
      expect(q.help!).toMatch(/pýtame sa preto/i);
    }
  });

  it('none of them is required, so the flow works without answering', () => {
    for (const q of sensitive) {
      expect(q.required).toBe(false);
    }
  });

  it('each keys on the administrative fact, not a diagnosis', () => {
    // "preukaz" / "posudkom potvrdený" rather than naming a condition.
    expect(
      skQuestions.find((q) => q.id === 'disability_card')!.label,
    ).toMatch(/preukaz/i);
    expect(
      skQuestions.find((q) => q.id === 'child_long_term_illness')!.label,
    ).toMatch(/posudkom/i);
  });
});

describe('answers map onto a situation', () => {
  const answers: Answers = {
    children_count: 2,
    children_dependent: 'yes',
    tenure: 'tenant',
    housing_cost: 430,
    household_income: 1200,
    applicant_status: 'employed',
    partner: 'yes',
    partner_income: 400,
    disability_card: 'no',
    child_long_term_illness: 'yes',
  };

  it('builds one person per household member', () => {
    const s = toSituation(answers, '2026-08');
    expect(s.persons).toHaveLength(4); // applicant, partner, 2 children
    expect(s.persons.filter((p) => p.role === 'child')).toHaveLength(2);
  });

  it('splits the household income without inventing more of it', () => {
    const s = toSituation(answers, '2026-08');
    const total = s.persons.reduce((sum, p) => sum + p.incomeMonthly, 0);
    expect(total).toBe(1200);
    expect(s.persons.find((p) => p.role === 'partner')!.incomeMonthly).toBe(400);
  });

  it('never produces a negative income when the partner earns more than the total', () => {
    const s = toSituation({ ...answers, household_income: 300, partner_income: 400 }, '2026-08');
    for (const p of s.persons) {
      expect(p.incomeMonthly).toBeGreaterThanOrEqual(0);
    }
  });

  it('claims the illness certificate for one child, not all of them', () => {
    // The question asks whether ANY child has it, so asserting it for every
    // child would be inventing facts about the others.
    const s = toSituation(answers, '2026-08');
    const flagged = s.persons.filter((p) => p.hasCertifiedLongTermIllness === true);
    expect(flagged).toHaveLength(1);
  });

  it('carries the tenure and housing cost through', () => {
    const s = toSituation(answers, '2026-08');
    expect(s.household.tenure).toBe('tenant');
    expect(s.household.housingCostMonthly).toBe(430);
    expect(s.household.registeredPersons).toBe(4);
  });

  it('leaves the housing cost absent when it was not asked', () => {
    const s = toSituation({ children_count: 0, household_income: 500 }, '2026-08');
    expect(s.household.housingCostMonthly).toBeUndefined();
  });

  it('maps the status onto the right flags', () => {
    const pensioner = toSituation({ ...answers, applicant_status: 'pensioner' }, '2026-08');
    expect(pensioner.persons[0]!.isPensioner).toBe(true);
    expect(pensioner.persons[0]!.isRegisteredJobseeker).toBe(false);

    const seeker = toSituation({ ...answers, applicant_status: 'jobseeker' }, '2026-08');
    expect(seeker.persons[0]!.isRegisteredJobseeker).toBe(true);
  });

  it('does not guess a child age it never asked for', () => {
    // Age is left at zero rather than invented. The benefits that need a real
    // age must record a missing fact instead of being handed a guess.
    const s = toSituation(answers, '2026-08');
    expect(s.persons.filter((p) => p.role === 'child').every((c) => c.ageYears === 0)).toBe(true);
  });
});

describe('question definitions are well formed', () => {
  it('no two questions share an id', () => {
    const ids = skQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every choice question offers choices, and no other kind does', () => {
    for (const q of skQuestions) {
      if (q.kind === 'single-choice') {
        expect(q.choices, `${q.id} has no choices`).toBeTruthy();
        expect(q.choices!.length).toBeGreaterThan(1);
      } else {
        expect(q.choices, `${q.id} should not carry choices`).toBeUndefined();
      }
    }
  });

  it('every numeric question is bounded', () => {
    for (const q of skQuestions.filter((x) => x.kind === 'number' || x.kind === 'money')) {
      expect(q.min, `${q.id} has no lower bound`).toBeDefined();
      expect(q.max, `${q.id} has no upper bound`).toBeDefined();
      expect(q.max!).toBeGreaterThan(q.min!);
    }
  });

  it('every question is phrased as a question', () => {
    for (const q of skQuestions) {
      expect(q.label.endsWith('?'), `${q.id} does not end with a question mark`).toBe(true);
    }
  });
});
