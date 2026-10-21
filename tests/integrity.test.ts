/**
 * Guards on the verification process itself.
 *
 * The two gates protect users from unchecked rules. These tests protect the
 * gates from us. Flipping `verified: true` is a two-character edit that turns
 * "we do not know" into "you are entitled to this", and it is exactly the kind
 * of edit that gets made at the end of a long day to make a test go green.
 *
 * So a flag is not enough on its own: claiming a parameter is verified requires
 * saying who checked it and when, and the build fails without that. The point
 * is not bureaucracy — it is that six months from now somebody has to be able
 * to ask "who confirmed this figure" and get an answer.
 */

import { describe, expect, it } from 'vitest';
import { skParameters } from '../src/rules/sk/parameters.js';
import { skRegistry } from '../src/rules/sk/index.js';
import { skLeads } from '../src/rules/sk/leads.js';
import { skOffices, skRequiredDocuments } from '../src/rules/sk/offices.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('a verified parameter must say who verified it', () => {
  for (const def of skParameters.all()) {
    it(`${def.path}`, () => {
      expect(def.source).toMatch(/^https:\/\//);
      expect(def.values.length).toBeGreaterThan(0);

      for (const value of def.values) {
        expect(value.from, `${def.path} commencement date`).toMatch(ISO_DATE);
        expect(Number.isFinite(value.value)).toBe(true);
        expect(value.value).toBeGreaterThanOrEqual(0);
      }

      if (def.verified) {
        expect(def.verifiedBy, `${def.path} is marked verified but names nobody`).toBeTruthy();
        expect(def.verifiedOn, `${def.path} is marked verified but has no date`).toMatch(ISO_DATE);
      }
    });
  }
});

describe('a reviewed benefit must say who reviewed it', () => {
  for (const benefit of skRegistry.benefits) {
    it(`${benefit.id}`, () => {
      expect(benefit.law.length).toBeGreaterThan(5);
      expect(benefit.requiredFacts.length).toBeGreaterThan(0);
      expect(skOffices[benefit.office]).toBeDefined();

      if (benefit.maturity === 'reviewed') {
        expect(
          benefit.reviewedBy,
          `${benefit.id} is marked reviewed but names nobody`,
        ).toBeTruthy();
        expect(benefit.reviewedOn, `${benefit.id} is marked reviewed but has no date`).toMatch(
          ISO_DATE,
        );
      }
    });
  }
});

describe('structural invariants', () => {
  it('no two benefits share an id', () => {
    const ids = skRegistry.benefits.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no two leads share an id', () => {
    const ids = skLeads.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every lead names a real benefit in supersededBy', () => {
    const known = new Set(skRegistry.benefits.map((b) => b.id));
    for (const lead of skLeads) {
      for (const id of lead.supersededBy ?? []) {
        expect(known.has(id), `lead ${lead.id} points at unknown benefit ${id}`).toBe(true);
      }
    }
  });

  it('every lead explains itself and promises nothing', () => {
    for (const lead of skLeads) {
      expect(lead.prompt.length).toBeGreaterThan(20);
      expect(lead.because.length).toBeGreaterThan(10);
      expect(skOffices[lead.office]).toBeDefined();
      // A lead must never read as a decided entitlement.
      expect(lead.prompt).not.toMatch(/\bmáte nárok\b/i);
      expect(lead.prompt).not.toMatch(/\bdostanete\b/i);
      expect(lead.prompt).not.toMatch(/\bEUR\b|€/);
    }
  });

  it('every documented benefit exists, and asks for a payout account', () => {
    const known = new Set(skRegistry.benefits.map((b) => b.id));
    for (const [benefitId, docs] of Object.entries(skRequiredDocuments)) {
      expect(known.has(benefitId), `documents listed for unknown benefit ${benefitId}`).toBe(true);
      expect(docs.length).toBeGreaterThan(1);
      expect(docs.join(' ')).toMatch(/IBAN/);
    }
  });

  it('no office invents a contact', () => {
    for (const office of Object.values(skOffices)) {
      expect(office.locatorUrl).toMatch(/^https:\/\//);
      if (!office.contactVerified) {
        expect(office.phone, `${office.kind} has a phone but nobody checked it`).toBeUndefined();
      }
    }
  });
});

describe('the current state of the rule base', () => {
  // Not an assertion so much as a readable progress report. These two numbers
  // are the project: everything else is scaffolding around them.
  it('reports how much is still unverified', () => {
    const params = skParameters.all();
    const verified = params.filter((p) => p.verified).length;
    const reviewed = skRegistry.benefits.filter((b) => b.maturity === 'reviewed').length;

    // eslint-disable-next-line no-console
    console.log(
      `\n  rule base: ${verified}/${params.length} parameters verified, ` +
        `${reviewed}/${skRegistry.benefits.length} benefits reviewed\n`,
    );

    expect(verified).toBeLessThanOrEqual(params.length);
    expect(reviewed).toBeLessThanOrEqual(skRegistry.benefits.length);
  });
});
