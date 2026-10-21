import { describe, expect, it } from 'vitest';
import { ParameterTable, type ParameterDefinition } from '../src/engine/parameters.js';
import { screen, type Registry } from '../src/engine/simulate.js';
import type { Benefit, Situation } from '../src/engine/types.js';

const defs: ParameterDefinition[] = [
  {
    path: 'test.amount',
    description: 'Verified test amount.',
    source: 'https://example.test/',
    verified: true,
    values: [
      { from: '2025-01-01', value: 10 },
      { from: '2026-01-01', value: 12 },
      { from: '2026-07-01', value: 15 },
    ],
  },
  {
    path: 'test.unchecked',
    description: 'Unverified test amount.',
    source: 'https://example.test/',
    verified: false,
    values: [{ from: '2025-01-01', value: 99 }],
  },
];

const table = new ParameterTable(defs);

function situation(period = '2026-03'): Situation {
  return {
    period,
    persons: [{ id: 'a', role: 'applicant', ageYears: 40, incomeMonthly: 1000 }],
    household: {},
  };
}

function benefit(over: Partial<Benefit> = {}): Benefit {
  return {
    id: 'b',
    name: 'Test benefit',
    law: 'test',
    office: 'upsvar',
    maturity: 'reviewed',
    requiredFacts: [],
    evaluate: (ctx) => ({ eligible: true, amountMonthly: ctx.param('test.amount') }),
    ...over,
  };
}

function registry(benefits: Benefit[], leads: Registry['leads'] = []): Registry {
  return { benefits, leads, parameters: table };
}

describe('dated parameters', () => {
  it('picks the value in force during the period', () => {
    expect(table.resolve('test.amount', '2025-06')).toBe(10);
    expect(table.resolve('test.amount', '2026-03')).toBe(12);
    expect(table.resolve('test.amount', '2026-09')).toBe(15);
  });

  it('treats a commencement date as inclusive from its own month', () => {
    // A change effective 1 July applies to July and leaves June alone.
    expect(table.resolve('test.amount', '2026-06')).toBe(12);
    expect(table.resolve('test.amount', '2026-07')).toBe(15);
  });

  it('refuses a period before any value existed', () => {
    expect(() => table.resolve('test.amount', '2024-12')).toThrow(/no value/i);
  });

  it('refuses an unknown parameter instead of returning zero', () => {
    expect(() => table.resolve('test.nope', '2026-03')).toThrow(/unknown parameter/i);
  });

  it('rejects a malformed period', () => {
    expect(() => table.resolve('test.amount', '2026')).toThrow(/YYYY-MM/);
  });

  it('rejects duplicate definitions at construction', () => {
    expect(() => new ParameterTable([defs[0]!, defs[0]!])).toThrow(/duplicate/i);
  });

  it('lists what still needs checking', () => {
    expect(table.unverifiedPaths()).toEqual(['test.unchecked']);
  });
});

describe('verification gate', () => {
  it('withholds an answer built on unverified numbers in production', () => {
    const b = benefit({
      evaluate: (ctx) => ({ eligible: true, amountMonthly: ctx.param('test.unchecked') }),
    });
    const r = screen(situation(), registry([b]), { mode: 'production' });

    expect(r.outcomes[0]!.status).toBe('unverified');
    expect(r.outcomes[0]!.amountMonthly).toBeUndefined();
    expect(r.outcomes[0]!.unverifiedParameters).toEqual(['test.unchecked']);
    expect(r.totalMonthly).toBe(0);
    expect(r.hasUnverified).toBe(true);
  });

  it('answers in development but says what it leaned on', () => {
    const b = benefit({
      evaluate: (ctx) => ({ eligible: true, amountMonthly: ctx.param('test.unchecked') }),
    });
    const r = screen(situation(), registry([b]), { mode: 'development' });

    expect(r.outcomes[0]!.status).toBe('eligible');
    expect(r.outcomes[0]!.amountMonthly).toBe(99);
    expect(r.outcomes[0]!.unverifiedParameters).toEqual(['test.unchecked']);
  });

  it('lets verified numbers through in production', () => {
    const r = screen(situation(), registry([benefit()]), { mode: 'production' });
    expect(r.outcomes[0]!.status).toBe('eligible');
    expect(r.outcomes[0]!.amountMonthly).toBe(12);
    expect(r.hasUnverified).toBe(false);
  });
});

describe('maturity gate', () => {
  it('refuses draft logic in production even with verified numbers', () => {
    const r = screen(situation(), registry([benefit({ maturity: 'draft' })]), {
      mode: 'production',
    });
    expect(r.outcomes[0]!.status).toBe('draft');
    expect(r.outcomes[0]!.amountMonthly).toBeUndefined();
    expect(r.hasUnverified).toBe(true);
  });

  it('runs draft logic in development', () => {
    const r = screen(situation(), registry([benefit({ maturity: 'draft' })]), {
      mode: 'development',
    });
    expect(r.outcomes[0]!.status).toBe('eligible');
  });
});

describe('missing facts are never a refusal', () => {
  it('reports what is missing instead of saying no', () => {
    const b = benefit({
      evaluate: (ctx) => {
        ctx.missing('household.tenure');
        return { eligible: false };
      },
    });
    const r = screen(situation(), registry([b]), { mode: 'production' });

    expect(r.outcomes[0]!.status).toBe('needs-more-info');
    expect(r.outcomes[0]!.missingFacts).toEqual(['household.tenure']);
  });

  it('does not duplicate the same missing fact', () => {
    const b = benefit({
      evaluate: (ctx) => {
        ctx.missing('x');
        ctx.missing('x');
        return { eligible: false };
      },
    });
    const r = screen(situation(), registry([b]), { mode: 'production' });
    expect(r.outcomes[0]!.missingFacts).toEqual(['x']);
  });
});

describe('a thrown rule is a bug, not a decision', () => {
  it('never turns an exception into "not entitled"', () => {
    const b = benefit({
      evaluate: () => {
        throw new Error('boom');
      },
    });
    const r = screen(situation(), registry([b]), { mode: 'production' });

    expect(r.outcomes[0]!.status).not.toBe('not-eligible');
    expect(r.outcomes[0]!.status).toBe('needs-more-info');
    expect(r.outcomes[0]!.trace.some((t) => t.rule === 'engine-error')).toBe(true);
  });

  it('keeps screening the other benefits', () => {
    const bad = benefit({
      id: 'bad',
      evaluate: () => {
        throw new Error('boom');
      },
    });
    const r = screen(situation(), registry([bad, benefit({ id: 'good' })]), {
      mode: 'production',
    });
    expect(r.outcomes).toHaveLength(2);
    expect(r.outcomes.find((o) => o.benefitId === 'good')!.status).toBe('eligible');
  });
});

describe('ordering and totals', () => {
  it('puts entitlements first, largest first', () => {
    const small = benefit({ id: 'small', evaluate: () => ({ eligible: true, amountMonthly: 5 }) });
    const big = benefit({ id: 'big', evaluate: () => ({ eligible: true, amountMonthly: 50 }) });
    const no = benefit({ id: 'no', evaluate: () => ({ eligible: false }) });

    const r = screen(situation(), registry([no, small, big]), { mode: 'production' });
    expect(r.outcomes.map((o) => o.benefitId)).toEqual(['big', 'small', 'no']);
    expect(r.totalMonthly).toBe(55);
  });

  it('counts only entitlements in the total', () => {
    const b = benefit({ evaluate: () => ({ eligible: false, amountMonthly: 999 }) });
    const r = screen(situation(), registry([b]), { mode: 'production' });
    expect(r.totalMonthly).toBe(0);
  });
});

describe('leads', () => {
  const lead: Registry['leads'][number] = {
    id: 'l1',
    prompt: 'check this',
    because: 'reason',
    office: 'upsvar',
    when: () => true,
  };

  it('never carries an amount', () => {
    const r = screen(situation(), registry([], [lead]), { mode: 'production' });
    expect(r.leads[0]).toBeDefined();
    expect(Object.keys(r.leads[0]!)).not.toContain('amountMonthly');
    expect(r.leads[0]!.because).toBe('reason');
  });

  it('is suppressed when the benefit it points at already came out', () => {
    const r = screen(
      situation(),
      registry([benefit({ id: 'b' })], [{ ...lead, supersededBy: ['b'] }]),
      { mode: 'production' },
    );
    expect(r.leads).toHaveLength(0);
  });

  it('still shows when that benefit was NOT an entitlement', () => {
    const r = screen(
      situation(),
      registry([benefit({ id: 'b', evaluate: () => ({ eligible: false }) })], [
        { ...lead, supersededBy: ['b'] },
      ]),
      { mode: 'production' },
    );
    expect(r.leads).toHaveLength(1);
  });

  it('a broken lead rule cannot take down the screening', () => {
    const broken: Registry['leads'][number] = {
      ...lead,
      id: 'broken',
      when: () => {
        throw new Error('boom');
      },
    };
    const r = screen(situation(), registry([benefit()], [broken, lead]), { mode: 'production' });
    expect(r.outcomes[0]!.status).toBe('eligible');
    expect(r.leads.map((l) => l.id)).toEqual(['l1']);
  });
});
