import { describe, expect, it } from 'vitest';
import { screenSk } from '../src/index.js';
import { skParameters, skRegistry } from '../src/rules/sk/index.js';
import { skOffices } from '../src/rules/sk/offices.js';
import type { Person, Situation } from '../src/engine/types.js';

function person(over: Partial<Person> & { id: string }): Person {
  return { role: 'other', ageYears: 30, incomeMonthly: 0, ...over };
}

function family(over: Partial<Situation> = {}): Situation {
  return {
    period: '2026-03',
    persons: [
      person({ id: 'p1', role: 'applicant', ageYears: 38, incomeMonthly: 900 }),
      person({ id: 'c1', role: 'child', ageYears: 7, isDependentChild: true }),
      person({ id: 'c2', role: 'child', ageYears: 12, isDependentChild: true }),
    ],
    household: { tenure: 'tenant', housingCostMonthly: 450, registeredPersons: 3 },
    ...over,
  };
}

describe('the SK package refuses to answer until a human has checked it', () => {
  it('ships with every parameter unverified', () => {
    expect(skParameters.unverifiedPaths().sort()).toEqual(
      skParameters.all().map((d) => d.path).sort(),
    );
  });

  it('ships every benefit as a draft', () => {
    expect(skRegistry.benefits.every((b) => b.maturity === 'draft')).toBe(true);
  });

  it('gives no entitlement and no amount in production', () => {
    const r = screenSk(family(), { mode: 'production' });

    expect(r.outcomes.every((o) => o.status !== 'eligible')).toBe(true);
    expect(r.totalMonthly).toBe(0);
    expect(r.actionable).toHaveLength(0);
    expect(r.hasUnverified).toBe(true);
  });

  it('explains why rather than just going quiet', () => {
    const r = screenSk(family(), { mode: 'production' });
    const reasons = r.outcomes.flatMap((o) => o.trace.map((t) => t.rule));
    expect(reasons).toContain('maturity-gate');
  });

  it('every parameter carries a source to check it against', () => {
    for (const def of skParameters.all()) {
      expect(def.source).toMatch(/^https:\/\//);
      expect(def.description.length).toBeGreaterThan(10);
    }
  });

  it('no office claims a verified contact, and none invents a phone number', () => {
    for (const office of Object.values(skOffices)) {
      expect(office.contactVerified).toBe(false);
      expect(office.phone).toBeUndefined();
      expect(office.locatorUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('child allowance, run in development', () => {
  const mode = 'development' as const;

  it('pays per qualifying child', () => {
    const r = screenSk(family(), { mode });
    const o = r.outcomes.find((x) => x.benefitId === 'sk-pridavok-na-dieta')!;
    const perChild = skParameters.resolve('pridavok.zakladna-suma', '2026-03');

    expect(o.status).toBe('eligible');
    expect(o.amountMonthly).toBe(2 * perChild);
  });

  it('does not arise without a child', () => {
    const r = screenSk(
      family({ persons: [person({ id: 'p1', role: 'applicant', incomeMonthly: 900 })] }),
      { mode },
    );
    const o = r.outcomes.find((x) => x.benefitId === 'sk-pridavok-na-dieta')!;
    expect(o.status).toBe('not-eligible');
  });

  it('asks instead of refusing when dependency is unanswered', () => {
    const r = screenSk(
      family({
        persons: [
          person({ id: 'p1', role: 'applicant', incomeMonthly: 900 }),
          person({ id: 'c1', role: 'child', ageYears: 7 }), // isDependentChild unset
        ],
      }),
      { mode },
    );
    const o = r.outcomes.find((x) => x.benefitId === 'sk-pridavok-na-dieta')!;

    expect(o.status).toBe('needs-more-info');
    expect(o.missingFacts).toContain('persons.c1.isDependentChild');
  });

  it('excludes a child over the age limit', () => {
    const maxAge = skParameters.resolve('pridavok.vek-max', '2026-03');
    const r = screenSk(
      family({
        persons: [
          person({ id: 'p1', role: 'applicant', incomeMonthly: 900 }),
          person({ id: 'c1', role: 'child', ageYears: maxAge + 1, isDependentChild: true }),
        ],
      }),
      { mode },
    );
    const o = r.outcomes.find((x) => x.benefitId === 'sk-pridavok-na-dieta')!;
    expect(o.status).toBe('not-eligible');
  });

  it('attaches the office and the documents to bring', () => {
    const r = screenSk(family(), { mode });
    const action = r.actionable.find((a) => a.outcome.benefitId === 'sk-pridavok-na-dieta')!;

    expect(action.office.name).toContain('Úrad práce');
    expect(action.office.whichBranch).toMatch(/trvalého pobytu/);
    expect(action.documents.length).toBeGreaterThan(2);
    expect(action.documents.join(' ')).toMatch(/IBAN/);
  });

  it('every step of the reasoning is traceable to a source', () => {
    const r = screenSk(family(), { mode });
    const o = r.outcomes.find((x) => x.benefitId === 'sk-pridavok-na-dieta')!;

    expect(o.trace.length).toBeGreaterThan(0);
    expect(o.trace.every((t) => t.detail.length > 0)).toBe(true);
    expect(o.trace.some((t) => typeof t.source === 'string')).toBe(true);
  });
});

describe('leads — the below-the-line prompts', () => {
  const mode = 'development' as const;

  it('raises extended parental allowance for a certified long-term illness', () => {
    const r = screenSk(
      family({
        persons: [
          person({ id: 'p1', role: 'applicant', incomeMonthly: 900 }),
          person({
            id: 'c1',
            role: 'child',
            ageYears: 4,
            isDependentChild: true,
            hasCertifiedLongTermIllness: true,
          }),
        ],
      }),
      { mode },
    );

    const lead = r.leads.find((l) => l.id === 'sk-predlzeny-rodicovsky');
    expect(lead).toBeDefined();
    expect(lead!.prompt).toMatch(/predĺžený rodičovský/);
    expect(lead!.because).toMatch(/zdravotným stavom/);
  });

  it('does not raise it for a healthy child', () => {
    const r = screenSk(family(), { mode });
    expect(r.leads.find((l) => l.id === 'sk-predlzeny-rodicovsky')).toBeUndefined();
  });

  it('raises the disability compensations group when a card exists', () => {
    const r = screenSk(
      family({
        persons: [person({ id: 'p1', role: 'applicant', incomeMonthly: 900, hasDisabilityCard: true })],
      }),
      { mode },
    );
    expect(r.leads.find((l) => l.id === 'sk-tzp-kompenzacie')).toBeDefined();
  });

  it('points the tax bonus at the tax authority, not the labour office', () => {
    const r = screenSk(family(), { mode });
    const lead = r.leads.find((l) => l.id === 'sk-danovy-bonus')!;
    expect(lead.office).toBe('financna-sprava');
  });

  it('raises the near-the-threshold housing prompt when rent eats a third of income', () => {
    const r = screenSk(
      family({
        persons: [person({ id: 'p1', role: 'applicant', incomeMonthly: 900 })],
        household: { tenure: 'tenant', housingCostMonthly: 400 },
      }),
      { mode },
    );
    expect(r.leads.find((l) => l.id === 'sk-byvanie-tesne-nad')).toBeDefined();
  });

  it('does not raise it when housing is a small share of income', () => {
    const r = screenSk(
      family({
        persons: [person({ id: 'p1', role: 'applicant', incomeMonthly: 3000 })],
        household: { tenure: 'owner', housingCostMonthly: 300 },
      }),
      { mode },
    );
    expect(r.leads.find((l) => l.id === 'sk-byvanie-tesne-nad')).toBeUndefined();
  });

  it('survives a household with no income at all', () => {
    const r = screenSk(
      family({
        persons: [person({ id: 'p1', role: 'applicant', incomeMonthly: 0 })],
        household: { tenure: 'tenant', housingCostMonthly: 400 },
      }),
      { mode },
    );
    // No division by zero, no crash, and no nonsense prompt.
    expect(r.leads.find((l) => l.id === 'sk-byvanie-tesne-nad')).toBeUndefined();
  });

  it('nudges an unregistered jobseeker', () => {
    const r = screenSk(
      family({
        persons: [
          person({ id: 'p1', role: 'applicant', incomeMonthly: 0, isRegisteredJobseeker: false }),
        ],
      }),
      { mode },
    );
    expect(r.leads.find((l) => l.id === 'sk-nezamestnany-neevidovany')).toBeDefined();
  });

  it('does not nudge a pensioner or a parent on leave', () => {
    const r = screenSk(
      family({
        persons: [
          person({ id: 'p1', role: 'applicant', incomeMonthly: 0, isRegisteredJobseeker: false, isPensioner: true }),
          person({ id: 'p2', role: 'partner', incomeMonthly: 0, isRegisteredJobseeker: false, isOnParentalLeave: true }),
        ],
      }),
      { mode },
    );
    expect(r.leads.find((l) => l.id === 'sk-nezamestnany-neevidovany')).toBeUndefined();
  });

  it('a lead never states an amount', () => {
    const r = screenSk(family(), { mode });
    for (const lead of r.leads) {
      expect(JSON.stringify(lead)).not.toMatch(/amount/i);
      expect(lead.because.length).toBeGreaterThan(5);
    }
  });
});

describe('housing allowance, run in development', () => {
  const mode = 'development' as const;
  // A period the placeholder subsistence figures actually cover. Picking one
  // deliberately is the point: the engine must not silently invent a value for
  // a month nobody has entered.
  const covered = '2026-08';

  it('reports a parameter gap rather than a refusal or an internal error', () => {
    // March 2026 predates every subsistence figure in the table.
    const r = screenSk(family({ period: '2026-03' }), { mode });
    const o = r.outcomes.find((x) => x.benefitId === 'sk-prispevok-na-byvanie')!;

    expect(o.status).toBe('unverified');
    expect(o.status).not.toBe('not-eligible');
    expect(o.trace.map((t) => t.rule)).toContain('parameter-gap');
    expect(o.unverifiedParameters!.join(' ')).toMatch(/zivotne-minimum/);
  });

  it('asks for tenure and housing cost when they are absent', () => {
    const r = screenSk(family({ period: covered, household: {} }), { mode });
    const o = r.outcomes.find((x) => x.benefitId === 'sk-prispevok-na-byvanie')!;

    expect(o.status).toBe('needs-more-info');
    expect(o.missingFacts).toContain('household.tenure');
    expect(o.missingFacts).toContain('household.housingCostMonthly');
  });

  it('shows the income test it applied, whichever way it went', () => {
    const r = screenSk(family({ period: covered }), { mode });
    const o = r.outcomes.find((x) => x.benefitId === 'sk-prispevok-na-byvanie')!;
    const rules = o.trace.map((t) => t.rule);

    expect(rules).toContain('zivotne-minimum-domacnosti');
    expect(rules).toContain('prijem-domacnosti');
    expect(rules).toContain('hmotna-nudza');
  });
});
