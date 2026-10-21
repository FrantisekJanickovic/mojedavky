/**
 * The question graph.
 *
 * This is where the product is won or lost. The full fact set across all
 * benefits is large, but for any given household most of it is irrelevant: a
 * pensioner living alone needs nothing asked about children, and somebody who
 * owns their home outright needs nothing asked about rent.
 *
 * So questions are not a form. They are a graph with two properties:
 *
 * - each question declares when it is relevant (`askWhen`), so irrelevant
 *   branches are never shown
 * - questions are ordered by how much they *eliminate*, so the few that rule
 *   whole benefits in or out come first
 *
 * Eight questions instead of three pages is the thing people will remember
 * about this app. It is also the thing that makes it usable by somebody filling
 * it in on a ten-year-old phone in a waiting room.
 *
 * No language model is involved. A conversational intake sounds more modern and
 * is worse here: slower than tapping a choice, harder to correct, and it would
 * mean sending income and health facts to a third party. The facts stay on the
 * device.
 */

import type { Person, Situation, Tenure } from '../engine/types.js';

export type AnswerValue = string | number | boolean | null;

/** Everything collected so far, keyed by question id. */
export type Answers = Record<string, AnswerValue>;

export type QuestionKind = 'single-choice' | 'number' | 'boolean' | 'money';

export interface Choice {
  value: string;
  label: string;
  /** Shown under the label when the choice needs disambiguating. */
  hint?: string;
}

export interface Question {
  id: string;
  /** The question, in the second person, as a person would be asked it. */
  label: string;
  /** Only when the question genuinely needs explaining. */
  help?: string;
  kind: QuestionKind;
  choices?: Choice[];
  /** Inclusive bounds for numeric answers. */
  min?: number;
  max?: number;
  /** Unit suffix shown next to a numeric field. */
  unit?: string;
  /**
   * Whether to ask this at all, given what is already known. Absent means
   * always ask.
   */
  askWhen?: (answers: Answers) => boolean;
  /**
   * How much this question narrows things down. Higher is asked earlier.
   * This is the ordering that keeps the flow short.
   */
  weight: number;
  /** True when the flow cannot produce a result without it. */
  required: boolean;
  /**
   * Special-category data under GDPR Art. 9. Asked only because a benefit
   * keys on it, phrased as the administrative fact rather than the condition,
   * and flagged so the UI can say why it is being asked.
   */
  sensitive?: boolean;
}

const yesNo: Choice[] = [
  { value: 'yes', label: 'Áno' },
  { value: 'no', label: 'Nie' },
];

function isYes(answers: Answers, id: string): boolean {
  return answers[id] === 'yes';
}

function childCount(answers: Answers): number {
  const raw = answers['children_count'];
  return typeof raw === 'number' ? raw : 0;
}

export const skQuestions: Question[] = [
  // --- The eliminating questions come first. -------------------------------
  {
    id: 'children_count',
    label: 'Koľko detí žije s vami v domácnosti?',
    help: 'Počítajte aj deti, ktoré študujú a bývajú cez týždeň v inom meste.',
    kind: 'number',
    min: 0,
    max: 15,
    weight: 100,
    required: true,
  },
  {
    id: 'tenure',
    label: 'Ako bývate?',
    kind: 'single-choice',
    choices: [
      { value: 'tenant', label: 'V nájme' },
      { value: 'owner', label: 'Vo vlastnom' },
      { value: 'cooperative', label: 'V družstevnom byte' },
      { value: 'other', label: 'Inak', hint: 'U rodiny, v ubytovni, bez trvalého bývania' },
    ],
    weight: 90,
    required: true,
  },
  {
    id: 'household_income',
    label: 'Aký je celkový mesačný príjem vašej domácnosti?',
    help: 'Všetky príjmy dokopy — výplaty, dávky, výživné, dôchodky. Stačí približne.',
    kind: 'money',
    min: 0,
    max: 100000,
    unit: '€',
    weight: 85,
    required: true,
  },

  // --- Branches that only open when they can matter. -----------------------
  {
    id: 'housing_cost',
    label: 'Koľko mesačne platíte za bývanie?',
    help: 'Nájom alebo úhrada do fondu, plus energie a vodu.',
    kind: 'money',
    min: 0,
    max: 10000,
    unit: '€',
    askWhen: (a) => a['tenure'] !== undefined && a['tenure'] !== null,
    weight: 70,
    required: false,
  },
  {
    id: 'children_dependent',
    label: 'Sú všetky deti nezaopatrené?',
    help: 'Nezaopatrené je dieťa, ktoré sa pripravuje na povolanie — chodí do školy a nepracuje na plný úväzok.',
    kind: 'single-choice',
    choices: yesNo,
    askWhen: (a) => childCount(a) > 0,
    weight: 65,
    required: false,
  },
  {
    id: 'child_long_term_illness',
    label: 'Má niektoré dieťa posudkom potvrdený dlhodobo nepriaznivý zdravotný stav?',
    help: 'Pýtame sa preto, že pri takomto posudku existuje nárok na dlhšie vyplácaný rodičovský príspevok. Odpoveď nikam neposielame.',
    kind: 'single-choice',
    choices: yesNo,
    askWhen: (a) => childCount(a) > 0,
    weight: 40,
    required: false,
    sensitive: true,
  },
  {
    id: 'disability_card',
    label: 'Máte vy alebo niekto v domácnosti preukaz ŤZP?',
    help: 'Pýtame sa preto, že na preukaz sa viaže samostatná skupina príspevkov. Odpoveď nikam neposielame.',
    kind: 'single-choice',
    choices: yesNo,
    weight: 35,
    required: false,
    sensitive: true,
  },
  {
    id: 'applicant_status',
    label: 'Čo z toho vás najlepšie opisuje?',
    kind: 'single-choice',
    choices: [
      { value: 'employed', label: 'Pracujem' },
      { value: 'jobseeker', label: 'Som evidovaný na úrade práce' },
      { value: 'unemployed_unregistered', label: 'Som bez práce a nie som evidovaný' },
      { value: 'parental', label: 'Som na materskej alebo rodičovskej' },
      { value: 'pensioner', label: 'Som na dôchodku' },
      { value: 'student', label: 'Študujem' },
    ],
    weight: 60,
    required: true,
  },
  {
    id: 'partner',
    label: 'Žije s vami partner alebo partnerka?',
    kind: 'single-choice',
    choices: yesNo,
    weight: 55,
    required: true,
  },
  {
    id: 'partner_income',
    label: 'Aký má partner alebo partnerka mesačný príjem?',
    help: 'Ak žiadny, nechajte nulu.',
    kind: 'money',
    min: 0,
    max: 100000,
    unit: '€',
    askWhen: (a) => isYes(a, 'partner'),
    weight: 50,
    required: false,
  },
];

/** Questions to ask, in order, given what is answered so far. */
export function nextQuestions(answers: Answers): Question[] {
  return skQuestions
    .filter((q) => (q.askWhen ? q.askWhen(answers) : true))
    .filter((q) => answers[q.id] === undefined)
    .sort((a, b) => b.weight - a.weight);
}

/** The next single question, or undefined when the flow is done. */
export function nextQuestion(answers: Answers): Question | undefined {
  return nextQuestions(answers)[0];
}

/** Questions that are relevant and still unanswered but not required. */
export function optionalRemaining(answers: Answers): Question[] {
  return nextQuestions(answers).filter((q) => !q.required);
}

/** True when every relevant required question has an answer. */
export function canScreen(answers: Answers): boolean {
  return nextQuestions(answers).every((q) => !q.required);
}

/**
 * Rough progress, for a progress bar that does not lie.
 *
 * It counts only questions that are actually relevant, so answering "no
 * children" makes the bar jump forward rather than leaving three dead child
 * questions sitting in the denominator.
 */
export function progress(answers: Answers): { answered: number; total: number } {
  const relevant = skQuestions.filter((q) => (q.askWhen ? q.askWhen(answers) : true));
  const answered = relevant.filter((q) => answers[q.id] !== undefined).length;
  return { answered, total: relevant.length };
}

function num(answers: Answers, id: string, fallback = 0): number {
  const raw = answers[id];
  return typeof raw === 'number' ? raw : fallback;
}

/**
 * Turn answers into a Situation the engine can evaluate.
 *
 * Household income is asked as one figure because that is how people know it,
 * then attributed to the applicant. The benefits modelled so far only ever use
 * the household total, so splitting it per person would be precision the
 * answers do not actually contain. When a benefit needs a real per-person
 * split, that benefit brings its own questions with it.
 */
export function toSituation(answers: Answers, period: string): Situation {
  const persons: Person[] = [];
  const status = answers['applicant_status'];

  const partnerIncome = isYes(answers, 'partner') ? num(answers, 'partner_income') : 0;
  const totalIncome = num(answers, 'household_income');

  persons.push({
    id: 'applicant',
    role: 'applicant',
    ageYears: 40,
    incomeMonthly: Math.max(0, totalIncome - partnerIncome),
    isStudent: status === 'student',
    isPensioner: status === 'pensioner',
    isOnParentalLeave: status === 'parental',
    isRegisteredJobseeker: status === 'jobseeker',
    hasDisabilityCard: isYes(answers, 'disability_card'),
  });

  if (isYes(answers, 'partner')) {
    persons.push({
      id: 'partner',
      role: 'partner',
      ageYears: 40,
      incomeMonthly: partnerIncome,
    });
  }

  const count = childCount(answers);
  const dependent = answers['children_dependent'];
  const ill = isYes(answers, 'child_long_term_illness');

  for (let i = 0; i < count; i++) {
    const child: Person = {
      id: `child-${i + 1}`,
      role: 'child',
      // Age is not asked yet. It is left undefined-as-zero rather than guessed,
      // and the benefits that need a real age record a missing fact for it —
      // which is the honest behaviour until an age question exists.
      ageYears: 0,
      incomeMonthly: 0,
    };
    if (dependent === 'yes') child.isDependentChild = true;
    if (dependent === 'no') child.isDependentChild = false;
    // Attributed to the first child only: the question asks whether ANY child
    // has the certificate, so claiming it for all of them would be inventing
    // facts about the others.
    if (ill && i === 0) child.hasCertifiedLongTermIllness = true;
    persons.push(child);
  }

  const tenure = answers['tenure'];
  const situation: Situation = {
    period,
    persons,
    household: {},
  };

  if (typeof tenure === 'string') {
    situation.household.tenure = tenure as Tenure;
  }
  if (answers['housing_cost'] !== undefined) {
    situation.household.housingCostMonthly = num(answers, 'housing_cost');
  }
  situation.household.registeredPersons = persons.length;

  return situation;
}
