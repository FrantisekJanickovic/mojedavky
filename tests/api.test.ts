/**
 * Contract tests for the HTTP handler.
 *
 * The handler is not deployed — the site is static and the browser runs the
 * engine itself. These tests exist because the handler is the seed of the batch
 * screening that would run server-side, and the contract is worth pinning
 * before anything depends on it.
 *
 * The one that matters most is the last group: the endpoint runs in production
 * mode, so it must refuse to state an entitlement while the rule base is
 * unverified. If a refactor ever flips that to development, these fail here
 * rather than on a live site.
 */

import { describe, expect, it } from 'vitest';
import handler from '../src/server/screen.js';

const endpoint = 'https://example.test/api/screen';

function post(body: unknown): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const household = {
  period: '2026-08',
  persons: [
    { id: 'p1', role: 'applicant', ageYears: 34, incomeMonthly: 820 },
    { id: 'c1', role: 'child', ageYears: 6, incomeMonthly: 0, isDependentChild: true },
  ],
  household: { tenure: 'tenant', housingCostMonthly: 430 },
};

describe('method handling', () => {
  it('rejects GET with an Allow header', async () => {
    const response = await handler(new Request(endpoint, { method: 'GET' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});

describe('input validation happens before the rules are touched', () => {
  it('rejects a body that is not JSON', async () => {
    const response = await handler(post('not json at all'));
    expect(response.status).toBe(400);
  });

  it('rejects a missing or malformed period', async () => {
    for (const period of [undefined, '2026', 'august', 42]) {
      const response = await handler(post({ ...household, period }));
      expect(response.status, `period=${String(period)}`).toBe(400);
    }
  });

  it('rejects an empty household', async () => {
    const response = await handler(post({ ...household, persons: [] }));
    expect(response.status).toBe(400);
  });

  it('rejects an implausibly large household rather than grinding on it', async () => {
    const persons = Array.from({ length: 21 }, (_, i) => ({
      id: `p${i}`,
      role: 'other',
      ageYears: 30,
      incomeMonthly: 0,
    }));
    const response = await handler(post({ ...household, persons }));
    expect(response.status).toBe(400);
  });

  it('explains what was wrong', async () => {
    const response = await handler(post({ ...household, period: 'nope' }));
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/period/i);
  });
});

describe('a valid request', () => {
  it('answers 200 with a screening', async () => {
    const response = await handler(post(household));
    expect(response.status).toBe(200);

    const report = (await response.json()) as Record<string, unknown>;
    expect(Array.isArray(report.outcomes)).toBe(true);
    expect(Array.isArray(report.leads)).toBe(true);
    expect(Array.isArray(report.actionable)).toBe(true);
    expect(report.period).toBe('2026-08');
  });

  it('is never cached and never indexed', async () => {
    // A screening is somebody's income and household composition. It must not
    // sit in a CDN, and the endpoint must not turn up in a search engine.
    const response = await handler(post(household));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
  });
});

describe('the handler runs in production mode', () => {
  it('states no entitlement while the rule base is unverified', async () => {
    const response = await handler(post(household));
    const report = (await response.json()) as {
      outcomes: { status: string; amountMonthly?: number }[];
      totalMonthly: number;
      actionable: unknown[];
      hasUnverified: boolean;
    };

    expect(report.outcomes.length).toBeGreaterThan(0);
    expect(report.outcomes.every((o) => o.status !== 'eligible')).toBe(true);
    expect(report.outcomes.every((o) => o.amountMonthly === undefined)).toBe(true);
    expect(report.totalMonthly).toBe(0);
    expect(report.actionable).toHaveLength(0);
    expect(report.hasUnverified).toBe(true);
  });

  it('puts every outcome through a gate', async () => {
    const response = await handler(post(household));
    const report = (await response.json()) as { outcomes: { status: string }[] };

    for (const outcome of report.outcomes) {
      expect(['draft', 'unverified', 'needs-more-info', 'not-eligible']).toContain(outcome.status);
    }
  });

  it('still returns the leads, which promise nothing', async () => {
    // Leads do not depend on verified amounts, so they remain useful while the
    // rule base is being filled in — and they carry no figures to be wrong.
    const response = await handler(post(household));
    const report = (await response.json()) as { leads: { prompt: string }[] };

    expect(report.leads.length).toBeGreaterThan(0);
    for (const lead of report.leads) {
      expect(JSON.stringify(lead)).not.toMatch(/amount/i);
    }
  });
});
