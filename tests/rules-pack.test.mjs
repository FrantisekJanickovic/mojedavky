/**
 * The rule pack: its validator, and whether the committed JSON still matches
 * the YAML it came from.
 *
 * Written in JavaScript rather than TypeScript because it tests a build script,
 * which is JavaScript and sits outside the TypeScript project. The alternative
 * was a hand-written declaration file for one import.
 *
 * The validator is the only thing between a mistyped key in a decree
 * transcription and a wrong number shown to somebody about their rent, so its
 * refusals are worth more tests than its acceptances.
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  validateDocument,
  serialise,
  compileJurisdiction,
  generatedPathFor,
} from '../scripts/compile-rules.mjs';

function doc(overrides = {}) {
  return {
    jurisdiction: 'sk',
    version: '2026.10.1',
    sources: { 'act-1': { title: 'Zákon č. 1/2000 Z. z.', url: 'https://example.test/act' } },
    parameters: [
      {
        path: 'davka.zakladna-suma',
        description: 'A monthly amount.',
        unit: 'eur',
        source: 'act-1',
        verified: false,
        values: [{ from: '2026-01-01', value: 42.5 }],
      },
    ],
    ...overrides,
  };
}

/** Replace the single parameter with one built from `changes`. */
function withParam(changes) {
  const base = doc();
  return doc({ parameters: [{ ...base.parameters[0], ...changes }] });
}

function errorsFor(document) {
  return validateDocument(document, 'sk').errors;
}

describe('a well-formed pack', () => {
  it('compiles', () => {
    const { json, errors } = validateDocument(doc(), 'sk');
    expect(errors).toEqual([]);
    expect(json.version).toBe('2026.10.1');
    expect(json.parameters).toHaveLength(1);
  });

  it('resolves the source key to its URL, so rules cite one canonical link', () => {
    const { json } = validateDocument(doc(), 'sk');
    expect(json.parameters[0].source).toBe('https://example.test/act');
    expect(json.parameters[0].sourceKey).toBe('act-1');
  });

  it('normalises a date YAML parsed as a Date object', () => {
    // An unquoted 2026-01-01 in YAML is a timestamp, not a string. Without
    // normalising, a file that quotes its dates and one that does not would
    // compile to different JSON and the engine would compare a date against
    // an ISO instant.
    const { json } = validateDocument(
      withParam({ values: [{ from: new Date('2026-01-01T00:00:00Z'), value: 1 }] }),
      'sk',
    );
    expect(json.parameters[0].values[0].from).toBe('2026-01-01');
  });

  it('sorts values by commencement date', () => {
    const { json } = validateDocument(
      withParam({
        values: [
          { from: '2026-07-01', value: 2 },
          { from: '2026-01-01', value: 1 },
        ],
      }),
      'sk',
    );
    expect(json.parameters[0].values.map((v) => v.from)).toEqual(['2026-01-01', '2026-07-01']);
  });
});

describe('a key it does not recognise is an error, not a shrug', () => {
  // This is the check that earns the whole validator. A silently ignored
  // `verifed: true` leaves a number unverified while looking checked, and the
  // first sign of it is a wrong answer.
  it('rejects a misspelled parameter key', () => {
    expect(errorsFor(withParam({ verifed: true }))).toEqual([
      expect.stringContaining('unknown key "verifed"'),
    ]);
  });

  it('rejects a misspelled key inside a value', () => {
    expect(errorsFor(withParam({ values: [{ form: '2026-01-01', value: 1 }] }))).toEqual([
      expect.stringContaining('unknown key "form"'),
      expect.stringContaining('from must be a date'),
    ]);
  });

  it('rejects an unknown key at the top level', () => {
    expect(errorsFor(doc({ paramters: [] }))).toEqual([
      expect.stringContaining('unknown key "paramters"'),
    ]);
  });
});

describe('the verification audit trail cannot be half-filled', () => {
  it('rejects verified without a name', () => {
    expect(errorsFor(withParam({ verified: true, verified_on: '2026-10-21' }))).toEqual([
      expect.stringContaining('verified_by is required'),
    ]);
  });

  it('rejects verified without a date', () => {
    expect(errorsFor(withParam({ verified: true, verified_by: 'Fero' }))).toEqual([
      expect.stringContaining('verified_on is required'),
    ]);
  });

  it('rejects an audit trail on something not verified', () => {
    expect(errorsFor(withParam({ verified: false, verified_by: 'Fero' }))).toEqual([
      expect.stringContaining('must be absent'),
    ]);
  });

  it('accepts a fully signed parameter', () => {
    const { json, errors } = validateDocument(
      withParam({ verified: true, verified_by: 'Fero', verified_on: '2026-10-21' }),
      'sk',
    );
    expect(errors).toEqual([]);
    expect(json.parameters[0]).toMatchObject({
      verified: true,
      verifiedBy: 'Fero',
      verifiedOn: '2026-10-21',
    });
  });

  it('refuses to call a placeholder verified', () => {
    // The one mistake the whole scheme exists to prevent: a number nobody has
    // supplied, marked as checked.
    expect(
      errorsFor(
        withParam({
          placeholder: true,
          verified: true,
          verified_by: 'Fero',
          verified_on: '2026-10-21',
        }),
      ),
    ).toEqual([expect.stringContaining('placeholder cannot be verified')]);
  });
});

describe('structural mistakes', () => {
  it('rejects a source that is not defined', () => {
    expect(errorsFor(withParam({ source: 'act-99' }))).toEqual([
      expect.stringContaining('is not defined under sources'),
    ]);
  });

  it('rejects two values commencing on the same day', () => {
    expect(
      errorsFor(
        withParam({
          values: [
            { from: '2026-01-01', value: 1 },
            { from: '2026-01-01', value: 2 },
          ],
        }),
      ),
    ).toEqual([expect.stringContaining('both commence on 2026-01-01')]);
  });

  it('rejects a duplicate path', () => {
    const base = doc();
    const twice = doc({ parameters: [base.parameters[0], { ...base.parameters[0] }] });
    expect(errorsFor(twice)).toEqual([expect.stringContaining('duplicate path')]);
  });

  it('rejects a unit it does not know', () => {
    expect(errorsFor(withParam({ unit: 'euros' }))).toEqual([
      expect.stringContaining('unit is required'),
    ]);
  });

  it('rejects an unquoted version, which YAML would read as a number', () => {
    expect(errorsFor(doc({ version: 2026.1 }))).toEqual([
      expect.stringContaining('quoted string'),
    ]);
  });

  it('reports every problem at once rather than the first', () => {
    // Whoever edits this file is checking law, not running a compiler in a
    // loop. One pass should tell them everything that is wrong.
    const errors = errorsFor(withParam({ unit: 'euros', source: 'act-99', verified: 'yes' }));
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('warnings are not failures', () => {
  it('warns about an uncited source without rejecting the file', () => {
    const { json, warnings } = validateDocument(
      doc({
        sources: {
          'act-1': { title: 'A', url: 'https://example.test/a' },
          'act-2': { title: 'B', url: 'https://example.test/b' },
        },
      }),
      'sk',
    );
    expect(json).toBeDefined();
    expect(warnings).toEqual([expect.stringContaining('act-2')]);
  });
});

describe('the committed pack', () => {
  it('is exactly what the YAML compiles to', async () => {
    // Without this, editing the YAML and forgetting to recompile would ship
    // the old numbers while the file on screen showed the new ones.
    const { json, errors } = await compileJurisdiction('sk');
    expect(errors).toEqual([]);

    const onDisk = await readFile(generatedPathFor('sk'), 'utf8');
    expect(onDisk).toBe(serialise(json));
  });

  it('still has nothing verified, which the engine depends on', async () => {
    const { json } = await compileJurisdiction('sk');
    expect(json.parameters.every((p) => !p.verified)).toBe(true);
  });
});
