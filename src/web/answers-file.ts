/**
 * Saving and loading answers as XML.
 *
 * The file is meant to be opened and read by a person, not only by this app.
 * Somebody who screens their household in October and comes back in March
 * should be able to see what they said last time without running anything, and
 * somebody helping a relative should be able to check the file before loading
 * it. So each answer carries its question in full, and the element names are in
 * the same language as the questions.
 *
 * Everything loaded is treated as untrusted. A file can be hand-edited, can
 * come from a different version of the app, or can simply be the wrong file —
 * so every value is put through the same validation as a typed answer, and
 * anything that fails is dropped with a count rather than silently accepted.
 * An entitlement computed from a number the interface would have refused is
 * exactly the failure this product cannot afford.
 */

import {
  baseQuestionFor,
  pruneIrrelevant,
  validateAnswer,
  type Answers,
} from '../intake/questions.js';

const FORMAT_VERSION = '1';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The label a value was stored under, so the file reads as a record. */
function labelFor(id: string): string {
  return baseQuestionFor(id)?.label ?? id;
}

/** What the person actually chose, rather than the stored code. */
function displayValue(id: string, value: Answers[string]): string {
  const question = baseQuestionFor(id);
  const choice = question?.choices?.find((c) => c.value === String(value));
  return choice ? choice.label : String(value);
}

export function toXml(answers: Answers, packVersion: string, now = new Date()): string {
  const rows = Object.entries(answers)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([id, value]) => {
      const kind = typeof value === 'number' ? 'cislo' : 'text';
      return [
        `  <odpoved id="${escapeXml(id)}" typ="${kind}">`,
        `    <otazka>${escapeXml(labelFor(id))}</otazka>`,
        `    <hodnota>${escapeXml(String(value))}</hodnota>`,
        `    <zobrazene>${escapeXml(displayValue(id, value))}</zobrazene>`,
        '  </odpoved>',
      ].join('\n');
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!--',
    '  Odpovede z aplikácie Na čo máte nárok.',
    '  Súbor je len váš. Môžete ho uložiť a neskôr znova načítať.',
    '  <hodnota> je to, čo sa načíta späť; <zobrazene> je pre vás.',
    '-->',
    `<odpovede format="${FORMAT_VERSION}" pravidla="${escapeXml(packVersion)}" ulozene="${now.toISOString().slice(0, 10)}">`,
    ...rows,
    '</odpovede>',
    '',
  ].join('\n');
}

export interface LoadResult {
  answers: Answers;
  /** How many answers were read and kept. */
  loaded: number;
  /** How many were present but refused, so the UI can say so rather than lie. */
  rejected: number;
}

export class AnswersFileError extends Error {}

/**
 * Parse a saved file.
 *
 * `DOMParser` with an XML type neither runs scripts nor resolves external
 * entities in a browser, so the parse itself is safe; the risk worth guarding
 * is a plausible-looking value, which is what validation is for.
 */
export function fromXml(text: string): LoadResult {
  const doc = new DOMParser().parseFromString(text, 'application/xml');

  if (doc.querySelector('parsererror')) {
    throw new AnswersFileError('Súbor sa nepodarilo prečítať — nie je to platný XML súbor.');
  }
  if (doc.documentElement.nodeName !== 'odpovede') {
    throw new AnswersFileError('Toto nie je súbor s odpoveďami z tejto aplikácie.');
  }

  const collected: Answers = {};
  let rejected = 0;

  for (const node of Array.from(doc.getElementsByTagName('odpoved'))) {
    const id = node.getAttribute('id');
    const raw = node.getElementsByTagName('hodnota')[0]?.textContent;
    if (!id || raw === null || raw === undefined) {
      rejected++;
      continue;
    }

    // A question this version does not have. Not an error — an older or newer
    // file — but it cannot be kept, because nothing would ever read it.
    const question = baseQuestionFor(id);
    if (!question) {
      rejected++;
      continue;
    }

    const checked = validateAnswer(question, raw.trim());
    if (!checked.ok) {
      rejected++;
      continue;
    }
    collected[id] = checked.value;
  }

  if (Object.keys(collected).length === 0) {
    throw new AnswersFileError('Súbor neobsahuje žiadne odpovede, ktoré by sme vedeli použiť.');
  }

  // Answers whose question is not relevant given the others are contradictions,
  // so they go rather than reaching the engine.
  const answers = pruneIrrelevant(collected);
  const dropped = Object.keys(collected).length - Object.keys(answers).length;

  return { answers, loaded: Object.keys(answers).length, rejected: rejected + dropped };
}

/** Hand the browser a file. Nothing is uploaded; the blob is made locally. */
export function download(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately races the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
