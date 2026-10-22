/**
 * The browser app.
 *
 * It runs the whole screening locally. No request is made, no analytics is
 * loaded, and nothing is stored — not in localStorage either, because a shared
 * or borrowed phone is a realistic situation for this audience and a restored
 * answer about somebody's income is a leak. Keeping answers is therefore an
 * explicit act: the person saves a file, and knows they have one.
 *
 * Deliberately no framework. This is a short flow and a result page; vanilla
 * DOM keeps the bundle in tens of kilobytes rather than hundreds, which matters
 * more here than developer convenience. Part of the audience opens this on a
 * five-year-old phone on metered data.
 */

import {
  canScreen,
  nextQuestion,
  progress,
  pruneIrrelevant,
  toSituation,
  validateAnswer,
  type Answers,
  type Question,
} from '../intake/questions.js';
import { screenSk, type Report } from '../index.js';
import { skOffices } from '../rules/sk/offices.js';
import { skRulePackVersion } from '../rules/sk/parameters.js';
import { AnswersFileError, download, fromXml, toXml } from './answers-file.js';
import type { Outcome } from '../engine/types.js';

type Screen = 'intro' | 'survey' | 'result';

let answers: Answers = {};
/** Answer order, so "Späť" undoes the last thing the person actually did. */
let order: string[] = [];
let screen: Screen = 'intro';
let notice = '';

const root = document.getElementById('app');

/** Assessment period: the current month. */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function money(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = String(value);
    else if (value !== undefined) (node as Record<string, unknown>)[key] = value;
  }
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function link(href: string, text: string): HTMLAnchorElement {
  return el('a', { href, rel: 'noopener' }, [text]);
}

function button(
  label: string,
  onClick: () => void,
  kind: 'primary' | 'quiet' = 'primary',
): HTMLButtonElement {
  const node = el('button', { class: kind, type: 'button' }, [label]);
  node.addEventListener('click', onClick);
  return node;
}

/** Move focus to the new heading so a screen reader announces each step. */
function focusHeading(): void {
  const heading = root?.querySelector<HTMLElement>('legend, h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}

// --- progress --------------------------------------------------------------

/**
 * A bar with no step count beside it.
 *
 * The count would be a promise about a total that genuinely changes: saying
 * there are children opens questions that did not exist a moment ago. The bar
 * simply follows the real denominator, so it can move backwards — which is
 * honest, and reads as the path getting longer rather than as lost work.
 */
function renderProgress(): HTMLElement {
  const { answered, total } = progress(answers);
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);

  const fill = el('i');
  fill.style.width = `${pct}%`;

  return el(
    'div',
    {
      class: 'progress',
      role: 'progressbar',
      ariaValueMin: '0',
      ariaValueMax: '100',
      ariaValueNow: String(pct),
      ariaLabel: 'Priebeh vypĺňania',
    },
    [fill],
  );
}

// --- saving and loading ----------------------------------------------------

function saveAnswers(): void {
  const stamp = new Date().toISOString().slice(0, 10);
  download(`moje-odpovede-${stamp}.xml`, toXml(answers, skRulePackVersion), 'application/xml');
}

function loadAnswers(): void {
  const picker = el('input', { type: 'file', accept: '.xml,application/xml,text/xml' });
  picker.style.display = 'none';

  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.remove();
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const result = fromXml(String(reader.result ?? ''));
        answers = result.answers;
        order = Object.keys(result.answers);
        screen = canScreen(answers) && !nextQuestion(answers) ? 'result' : 'survey';
        notice =
          result.rejected > 0
            ? `Načítali sme ${result.loaded} odpovedí. ${result.rejected} sme nepoužili — nesedeli s otázkami.`
            : `Načítali sme ${result.loaded} odpovedí.`;
      } catch (error) {
        notice =
          error instanceof AnswersFileError
            ? error.message
            : 'Súbor sa nepodarilo prečítať.';
      }
      render();
    });
    reader.addEventListener('error', () => {
      notice = 'Súbor sa nepodarilo prečítať.';
      render();
    });
    reader.readAsText(file);
  });

  document.body.append(picker);
  picker.click();
}

function fileActions(): HTMLElement {
  return el('div', { class: 'actions no-print' }, [
    button('Nahrať moje odpovede', loadAnswers, 'quiet'),
    ...(Object.keys(answers).length > 0 ? [button('Uložiť odpovede', saveAnswers, 'quiet')] : []),
  ]);
}

function noticeLine(): Node[] {
  if (!notice) return [];
  const text = notice;
  notice = '';
  return [el('p', { class: 'muted no-print', role: 'status' }, [text])];
}

// --- screens ---------------------------------------------------------------

function renderIntro(): void {
  if (!root) return;
  root.textContent = '';

  root.append(
    el('h1', {}, ['Na čo máte nárok']),
    el('p', { class: 'lede' }, [
      'Štát vypláca dávky, o ktoré treba požiadať. Sami od seba neprídu, ' +
        'a nikto vás na ne neupozorní.',
    ]),
    button('Začať', () => {
      screen = 'survey';
      render();
    }),
    // The privacy promise sits here, directly under the button, because this
    // is where somebody hesitates. Further down the page it is an explanation;
    // here it is a reason to press.
    el('p', { class: 'faint' }, [
      'Zvyčajne šesť až desať otázok, pár minút. ' +
        'Odpovede zostávajú vo vašom zariadení.',
    ]),
    ...noticeLine(),

    el('h2', {}, ['Ako to funguje']),
    el('p', {}, [
      'Pýtame sa len to, čo pri vašej situácii naozaj rozhoduje. ' +
        'Kto nemá deti, nedostane ani jednu otázku o deťoch. ' +
        'Pri každej odpovedi sa zvyšok otázok prispôsobí.',
    ]),
    el('p', {}, [
      'Výpočet beží priamo vo vašom prehliadači. Nepotrebujeme meno ani ' +
        'e-mail, odpovede sa nikam neposielajú a nikde sa neukladajú.',
    ]),

    el('h2', {}, ['Čo dostanete na konci']),
    el('dl', {}, [
      el('dt', {}, ['Na ktoré dávky máte nárok']),
      el('dd', {}, ['Aj s orientačnou sumou na mesiac.']),
      el('dt', {}, ['Kde a ako o ne požiadať']),
      el('dd', {}, ['Ktorý úrad, akou cestou a aké doklady si vziať so sebou.']),
      el('dt', {}, ['Čo ešte stojí za to overiť']),
      el('dd', {}, ['Nároky, ktoré z vašich odpovedí nevieme rozhodnúť, ale môžu sa vás týkať.']),
      el('dt', {}, ['Výsledok na vytlačenie a odpovede na uloženie']),
      el('dd', {}, ['PDF pre seba alebo na úrad, a súbor XML, ktorý viete neskôr načítať späť.']),
    ]),

    fileActions(),

    el('footer', {}, [
      el('p', {}, [
        'Toto nie je rozhodnutie úradu ani právne poradenstvo. ' +
          'O nároku rozhoduje príslušný úrad na základe vašej žiadosti a dokladov.',
      ]),
    ]),
  );

  focusHeading();
}

function goBack(): void {
  const last = order.pop();
  if (last === undefined) {
    screen = 'intro';
    render();
    return;
  }
  delete answers[last];
  answers = pruneIrrelevant(answers);
  order = order.filter((id) => id in answers);
  render();
}

function answerAndAdvance(question: Question, value: Answers[string]): void {
  answers[question.id] = value;
  order = order.filter((id) => id !== question.id).concat(question.id);
  // A changed earlier answer can make a later one impossible.
  answers = pruneIrrelevant(answers);
  order = order.filter((id) => id in answers);
  render();
}

function renderChoice(question: Question): HTMLElement {
  const group = el('div', { class: 'choices' });

  for (const choice of question.choices ?? []) {
    const children: Node[] = [el('b', {}, [choice.label])];
    if (choice.hint) children.push(el('span', {}, [choice.hint]));

    const node = el('button', { class: 'choice', type: 'button' }, children);
    node.addEventListener('click', () => answerAndAdvance(question, choice.value));
    group.append(node);
  }

  return group;
}

function renderNumber(question: Question): HTMLElement {
  const input = el('input', {
    type: 'number',
    id: `q-${question.id}`,
    inputMode: question.kind === 'money' ? 'decimal' : 'numeric',
    min: String(question.min ?? 0),
    max: String(question.max ?? 999999),
    step: question.kind === 'money' ? '0.01' : '1',
    // Nothing is pre-filled. A default that happens to be plausible is a
    // number the person never actually told us.
    value: '',
  });

  const field = el('div', { class: 'field' }, [input]);
  if (question.unit) field.append(el('span', { class: 'unit' }, [question.unit]));

  const error = el('p', { class: 'error', role: 'alert' });
  const form = el('form', {}, [field, error]);
  form.append(el('button', { class: 'primary', type: 'submit' }, ['Pokračovať']));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const checked = validateAnswer(question, input.value);
    if (!checked.ok) {
      error.textContent = checked.error;
      input.focus();
      return;
    }
    answerAndAdvance(question, checked.value);
  });

  return form;
}

function renderQuestion(question: Question): void {
  if (!root) return;
  root.textContent = '';

  const parts: Node[] = [el('legend', {}, [question.label])];
  if (question.help) parts.push(el('p', { class: 'help' }, [question.help]));
  parts.push(question.kind === 'single-choice' ? renderChoice(question) : renderNumber(question));

  root.append(renderProgress(), el('fieldset', {}, parts), ...noticeLine());

  const secondary = el('div', { class: 'actions no-print' }, [button('Späť', goBack, 'quiet')]);
  if (canScreen(answers)) {
    secondary.append(button('Preskočiť zvyšok a zobraziť výsledok', showResult, 'quiet'));
  }
  root.append(secondary, fileActions());

  root.append(
    el('p', { class: 'faint' }, [
      question.sensitive
        ? 'Táto otázka je nepovinná. Odpoveď zostáva vo vašom zariadení — nikam sa neposiela.'
        : 'Odpovede zostávajú vo vašom zariadení.',
    ]),
  );

  focusHeading();
}

function showResult(): void {
  screen = 'result';
  render();
}

function officeDetail(outcome: Outcome, documents: string[]): Node[] {
  const office = skOffices[outcome.office];
  const parts: Node[] = [
    el('p', {}, [el('strong', {}, [office.name]), document.createTextNode(` — ${office.how}`)]),
    el('p', { class: 'muted' }, [office.whichBranch]),
  ];

  if (documents.length > 0) {
    parts.push(
      el('p', {}, ['Čo si vziať so sebou:']),
      el('ul', {}, documents.map((doc) => el('li', {}, [doc]))),
    );
  }

  parts.push(el('p', {}, [link(office.locatorUrl, 'Nájdite svoj úrad a kontakty')]));
  return parts;
}

function renderResult(): void {
  if (!root) return;
  root.textContent = '';

  const report: Report = screenSk(toSituation(answers, currentPeriod()));

  root.append(el('h1', {}, ['Čo sme zistili']), ...noticeLine());

  if (report.actionable.length > 0) {
    root.append(
      el('p', { class: 'amount' }, [money(report.totalMonthly)]),
      el('p', { class: 'sum' }, [
        'mesačne, podľa vašich odpovedí. Suma je orientačná — rozhoduje úrad.',
      ]),
      el('h2', {}, ['Na toto máte nárok']),
    );

    for (const item of report.actionable) {
      root.append(
        el('div', { class: 'entry' }, [
          el('p', { class: 'benefit' }, [item.outcome.benefitName]),
          el('p', { class: 'muted' }, [
            `${money(item.outcome.amountMonthly ?? 0)} mesačne · ${item.outcome.law}`,
          ]),
          ...officeDetail(item.outcome, item.documents),
        ]),
      );
    }
  } else {
    root.append(
      el('p', { class: 'lede' }, [
        'Z vašich odpovedí nám zatiaľ nevyšiel nárok, ktorý by sme vedeli spočítať. ' +
          'To neznamená, že žiadny nemáte — nižšie je, čo stojí za to overiť.',
      ]),
    );
  }

  // The honest state of the rule base, stated plainly rather than hidden.
  const gated = report.outcomes.filter((o) => o.status === 'draft' || o.status === 'unverified');
  if (gated.length > 0) {
    root.append(
      el('h2', {}, ['Toto vám zatiaľ nespočítame']),
      el('p', {}, [
        'Pravidlá a sumy pre tieto dávky ešte neprešli kontrolou odborníka. ' +
          'Radšej vám nepovieme nič, než aby sme vám povedali nesprávne číslo. ' +
          'Informovať sa o nich môžete priamo na úrade.',
      ]),
    );
    for (const outcome of gated) {
      root.append(
        el('div', { class: 'entry' }, [
          el('p', { class: 'benefit' }, [outcome.benefitName]),
          el('p', { class: 'muted' }, [outcome.law]),
          el('p', {}, [
            link(
              skOffices[outcome.office].locatorUrl,
              `Informovať sa — ${skOffices[outcome.office].name}`,
            ),
          ]),
        ]),
      );
    }
  }

  const missing = report.outcomes.filter((o) => o.status === 'needs-more-info');
  if (missing.length > 0) {
    root.append(
      el('h2', {}, ['Na toto nám chýbajú údaje']),
      ...missing.map((outcome) =>
        el('div', { class: 'entry' }, [
          el('p', { class: 'benefit' }, [outcome.benefitName]),
          el('p', { class: 'muted' }, [
            'Niektoré potrebné údaje sme sa nepýtali alebo zostali nevyplnené, ' +
              'takže nárok nevieme posúdiť.',
          ]),
        ]),
      ),
    );
  }

  // Leads need no verified amounts, so they are useful today.
  if (report.leads.length > 0) {
    root.append(el('h2', {}, ['Stojí za to overiť']));
    for (const lead of report.leads) {
      const parts: Node[] = [
        el('p', { class: 'benefit' }, [lead.title]),
        el('p', {}, [lead.prompt]),
        el('p', { class: 'muted' }, [lead.because]),
      ];
      if (lead.moreInfoUrl) parts.push(el('p', {}, [link(lead.moreInfoUrl, 'Viac informácií')]));
      root.append(el('div', { class: 'entry' }, parts));
    }
  }

  root.append(
    el('div', { class: 'actions actions-end no-print' }, [
      button('Stiahnuť ako PDF', () => window.print()),
      button('Uložiť odpovede (XML)', saveAnswers, 'quiet'),
      button(
        'Začať odznova',
        () => {
          answers = {};
          order = [];
          // Straight back to the first question rather than the landing page.
          // Whoever has just read a result knows what this is; making them
          // click through the pitch again would be friction for nothing.
          screen = 'survey';
          render();
        },
        'quiet',
      ),
    ]),
    el('footer', {}, [
      el('p', {}, [
        'Toto nie je rozhodnutie úradu ani právne poradenstvo. ' +
          'O nároku rozhoduje príslušný úrad na základe vašej žiadosti a dokladov.',
      ]),
      el('p', {}, [
        'Vaše odpovede neopustili toto zariadenie. Neposielame ich na server ' +
          'a neukladáme ich.',
      ]),
      el('p', {}, [`Pravidlá verzia ${skRulePackVersion}.`]),
    ]),
  );

  focusHeading();
}

function render(): void {
  if (screen === 'intro') return renderIntro();
  if (screen === 'result') return renderResult();

  const question = nextQuestion(answers);
  if (question) return renderQuestion(question);
  return renderResult();
}

render();
