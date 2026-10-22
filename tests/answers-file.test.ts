/**
 * @vitest-environment jsdom
 *
 * Saving answers to XML and reading them back.
 *
 * The file leaves this app and can come back changed — hand-edited, written by
 * an older version, or simply the wrong file picked from a folder. So the
 * loading side is where the tests concentrate: every value has to clear the
 * same bar as one typed into the interface, because an entitlement computed
 * from a number the form would have refused is the failure this product cannot
 * afford.
 */

import { describe, expect, it } from 'vitest';
import { AnswersFileError, fromXml, toXml } from '../src/web/answers-file.js';
import type { Answers } from '../src/intake/questions.js';

const complete: Answers = {
  children_count: 2,
  child_age__1: 9,
  child_age__2: 4,
  tenure: 'tenant',
  household_income: 980,
  housing_cost: 430,
  children_dependent: 'yes',
  child_long_term_illness: 'no',
  disability_card: 'no',
  applicant_status: 'employed',
  partner: 'no',
};

function save(answers: Answers): string {
  return toXml(answers, '2026.10.1', new Date('2026-10-22T08:00:00Z'));
}

describe('the saved file', () => {
  it('round-trips every answer', () => {
    const { answers, rejected } = fromXml(save(complete));
    expect(answers).toEqual(complete);
    expect(rejected).toBe(0);
  });

  it('keeps numbers as numbers, so the engine does not get strings', () => {
    const { answers } = fromXml(save(complete));
    expect(typeof answers['children_count']).toBe('number');
    expect(typeof answers['tenure']).toBe('string');
  });

  it('records which rule pack produced it', () => {
    expect(save(complete)).toContain('pravidla="2026.10.1"');
  });

  it('is readable without this app', () => {
    // Somebody who screens in October and returns in March should be able to
    // open the file and see what they said, without running anything.
    const xml = save(complete);
    expect(xml).toContain('<otazka>Ako bývate?</otazka>');
    expect(xml).toContain('<zobrazene>V nájme</zobrazene>');
  });

  it('escapes characters that would otherwise break the document', () => {
    const xml = toXml({ tenure: 'a & b < c > d "e"' }, '2026.10.1');
    expect(xml).toContain('a &amp; b &lt; c &gt; d &quot;e&quot;');
    // And it still parses, which is the point of escaping it.
    expect(() => new DOMParser().parseFromString(xml, 'application/xml')).not.toThrow();
  });
});

describe('a file that cannot be trusted', () => {
  function fileWith(id: string, value: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<odpovede format="1">',
      `  <odpoved id="${id}" typ="cislo"><hodnota>${value}</hodnota></odpoved>`,
      '  <odpoved id="children_count" typ="cislo"><hodnota>1</hodnota></odpoved>',
      '  <odpoved id="child_age__1" typ="cislo"><hodnota>7</hodnota></odpoved>',
      '</odpovede>',
    ].join('\n');
  }

  it('refuses a number outside the question’s range', () => {
    // 9999 children is not a household, it is a typo or a tampered file.
    const { answers, rejected } = fromXml(fileWith('household_income', '999999999'));
    expect(answers['household_income']).toBeUndefined();
    expect(rejected).toBe(1);
  });

  it('refuses a choice that is not one of the offered options', () => {
    const { answers, rejected } = fromXml(fileWith('tenure', 'mansion'));
    expect(answers['tenure']).toBeUndefined();
    expect(rejected).toBe(1);
  });

  it('drops a question this version does not have', () => {
    const { answers, rejected } = fromXml(fileWith('zrusena_otazka', '5'));
    expect(answers['zrusena_otazka']).toBeUndefined();
    expect(rejected).toBe(1);
  });

  it('drops answers that contradict the others', () => {
    // A partner's income with no partner would otherwise reach the engine and
    // be counted into the household total.
    const xml = save({ ...complete, partner: 'no', partner_income: 800 });
    const { answers, rejected } = fromXml(xml);
    expect(answers['partner_income']).toBeUndefined();
    expect(rejected).toBe(1);
  });

  it('accepts a decimal written with a comma', () => {
    const { answers } = fromXml(fileWith('household_income', '1234,50'));
    expect(answers['household_income']).toBe(1234.5);
  });

  it('reports how many it refused, rather than quietly keeping fewer', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<odpovede format="1">',
      '  <odpoved id="children_count" typ="cislo"><hodnota>1</hodnota></odpoved>',
      '  <odpoved id="child_age__1" typ="cislo"><hodnota>7</hodnota></odpoved>',
      '  <odpoved id="tenure" typ="text"><hodnota>castle</hodnota></odpoved>',
      '  <odpoved id="household_income" typ="cislo"><hodnota>-5</hodnota></odpoved>',
      '</odpovede>',
    ].join('\n');

    const result = fromXml(xml);
    expect(result.loaded).toBe(2);
    expect(result.rejected).toBe(2);
  });
});

describe('a file that is not ours', () => {
  it('rejects something that is not XML at all', () => {
    expect(() => fromXml('this is not xml')).toThrow(AnswersFileError);
  });

  it('rejects XML with a different root element', () => {
    expect(() => fromXml('<?xml version="1.0"?><rozpocet><a>1</a></rozpocet>')).toThrow(
      /nie je súbor s odpoveďami/i,
    );
  });

  it('rejects a file whose answers are all unusable', () => {
    const xml =
      '<?xml version="1.0"?><odpovede><odpoved id="nic"><hodnota>1</hodnota></odpoved></odpovede>';
    expect(() => fromXml(xml)).toThrow(/žiadne odpovede/i);
  });

  it('says what is wrong in words the person can act on', () => {
    try {
      fromXml('nope');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toMatch(/nepodarilo prečítať/i);
    }
  });
});
