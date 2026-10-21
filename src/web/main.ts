/**
 * The browser app.
 *
 * It runs the whole screening locally. No request is made, no analytics is
 * loaded, and nothing is stored — not in localStorage either, because a shared
 * or borrowed phone is a realistic situation for this audience and a restored
 * answer about somebody's income is a leak.
 *
 * Deliberately no framework. This is a ten-question flow and a result page;
 * vanilla DOM keeps the bundle in single-digit kilobytes, which matters more
 * here than developer convenience. Part of the audience opens this on a
 * five-year-old phone on metered data.
 */

import {
  canScreen,
  nextQuestion,
  progress,
  toSituation,
  type Answers,
  type Question,
} from '../intake/questions.js';
import { screenSk, type Report } from '../index.js';
import { skOffices } from '../rules/sk/offices.js';
import type { Outcome } from '../engine/types.js';

const answers: Answers = {};
const root = document.getElementById('app');

/** Assessment period: the current month. */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

function clear(): void {
  if (root) root.textContent = '';
}

/** Move focus to the new heading so a screen reader announces each step. */
function focusHeading(): void {
  const heading = root?.querySelector<HTMLElement>('legend, h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}

function renderProgress(): HTMLElement {
  const { answered, total } = progress(answers);
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);

  const fill = el('i');
  fill.style.width = `${pct}%`;

  const bar = el(
    'div',
    {
      class: 'bar',
      role: 'progressbar',
      ariaValueNow: String(answered),
      ariaValueMax: String(total),
      ariaLabel: `Otázka ${answered + 1} z ${total}`,
    },
    [fill],
  );
  return bar;
}

function answerAndAdvance(question: Question, value: Answers[string]): void {
  answers[question.id] = value;
  render();
}

function renderChoice(question: Question): HTMLElement {
  const group = el('div', { class: 'choices' });

  for (const choice of question.choices ?? []) {
    const label = el('b', {}, [choice.label]);
    const children: Node[] = [label];
    if (choice.hint) children.push(el('span', {}, [choice.hint]));

    const button = el('button', { class: 'choice', type: 'button' }, children);
    button.addEventListener('click', () => answerAndAdvance(question, choice.value));
    group.append(button);
  }

  return group;
}

function renderNumber(question: Question): HTMLElement {
  const wrapper = el('div');

  const input = el('input', {
    type: 'number',
    id: `q-${question.id}`,
    inputMode: question.kind === 'money' ? 'decimal' : 'numeric',
    min: String(question.min ?? 0),
    max: String(question.max ?? 999999),
    // Nothing is pre-filled. A default that happens to be plausible is a
    // number the person never actually told us.
    value: '',
  });

  const row = el('div', { class: 'field-row' }, [input]);
  if (question.unit) row.append(el('span', { class: 'unit' }, [question.unit]));

  const submit = el('button', { class: 'primary', type: 'submit' }, ['Pokračovať']);
  const error = el('p', { class: 'help', role: 'alert' });

  const form = el('form', {}, [row, error, submit]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = input.value.trim();

    if (raw === '') {
      error.textContent = 'Zadajte číslo. Ak je to nula, napíšte 0.';
      input.focus();
      return;
    }

    const value = Number(raw);
    const min = question.min ?? 0;
    const max = question.max ?? Number.MAX_SAFE_INTEGER;

    if (!Number.isFinite(value) || value < min || value > max) {
      error.textContent = `Zadajte číslo medzi ${min} a ${max}.`;
      input.focus();
      return;
    }

    answerAndAdvance(question, value);
  });

  wrapper.append(form);
  return wrapper;
}

function renderQuestion(question: Question): void {
  clear();
  if (!root) return;

  const legend = el('legend', {}, [question.label]);
  const parts: Node[] = [legend];

  if (question.help) parts.push(el('p', { class: 'help' }, [question.help]));
  parts.push(question.kind === 'single-choice' ? renderChoice(question) : renderNumber(question));

  const fieldset = el('fieldset', {}, parts);
  root.append(renderProgress(), fieldset);

  if (canScreen(answers)) {
    const skip = el('button', { class: 'link', type: 'button' }, [
      'Zvyšné otázky preskočiť a zobraziť výsledok',
    ]);
    skip.addEventListener('click', renderResult);
    root.append(skip);
  }

  root.append(
    el('p', { class: 'muted' }, [
      question.sensitive
        ? 'Táto otázka je nepovinná. Odpoveď zostáva vo vašom zariadení — nikam sa neposiela.'
        : 'Odpovede zostávajú vo vašom zariadení. Nikam sa neposielajú a neukladajú.',
    ]),
  );

  focusHeading();
}

function officeBlock(outcome: Outcome, documents: string[]): HTMLElement {
  const office = skOffices[outcome.office];
  const items: Node[] = [
    el('p', {}, [office.how]),
    el('p', { class: 'muted' }, [office.whichBranch]),
  ];

  if (documents.length > 0) {
    const list = el('ul', {}, documents.map((doc) => el('li', {}, [doc])));
    items.push(el('p', {}, ['Čo si vziať:']), list);
  }

  items.push(
    el('p', {}, [
      el('a', { href: office.locatorUrl, rel: 'noopener' }, ['Nájdite svoj úrad a kontakty']),
    ]),
  );

  return el('div', { class: 'card' }, [el('h3', {}, [office.name]), ...items]);
}

function renderResult(): void {
  clear();
  if (!root) return;

  const situation = toSituation(answers, currentPeriod());
  const report: Report = screenSk(situation);

  root.append(el('h1', {}, ['Čo sme zistili']));

  // Entitlements, with the practical part attached.
  if (report.actionable.length > 0) {
    root.append(
      el('h2', {}, ['Máte nárok']),
      el('p', {}, [
        `Dokopy približne ${report.totalMonthly.toFixed(2)} € mesačne. Výpočet je orientačný — rozhoduje úrad.`,
      ]),
    );
    for (const item of report.actionable) {
      root.append(
        el('div', { class: 'card' }, [
          el('h3', {}, [item.outcome.benefitName]),
          el('p', {}, [`${(item.outcome.amountMonthly ?? 0).toFixed(2)} € mesačne`]),
        ]),
        officeBlock(item.outcome, item.documents),
      );
    }
  }

  // The honest state of the rule base, stated plainly rather than hidden.
  const gated = report.outcomes.filter((o) => o.status === 'draft' || o.status === 'unverified');
  if (gated.length > 0) {
    root.append(
      el('div', { class: 'notice' }, [
        el('strong', {}, ['Tieto dávky vám ešte nedokážeme spočítať']),
        document.createTextNode(
          'Pravidlá a sumy pre ne zatiaľ neprešli kontrolou odborníka, takže vám ' +
            'radšej nepovieme nič, než aby sme vám povedali nesprávne číslo. ' +
            'Informovať sa o nich môžete priamo na úrade.',
        ),
      ]),
    );
    for (const outcome of gated) {
      root.append(
        el('div', { class: 'card gated' }, [
          el('h3', {}, [outcome.benefitName]),
          el('p', { class: 'muted' }, [outcome.law]),
          el('p', {}, [
            el('a', { href: skOffices[outcome.office].locatorUrl, rel: 'noopener' }, [
              `Informovať sa — ${skOffices[outcome.office].name}`,
            ]),
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
        el('div', { class: 'card' }, [
          el('h3', {}, [outcome.benefitName]),
          el('p', { class: 'muted' }, [
            'Nevieme posúdiť — niektoré potrebné údaje sme sa nepýtali alebo zostali nevyplnené.',
          ]),
        ]),
      ),
    );
  }

  // Leads. These need no verified amounts, so they are useful today.
  if (report.leads.length > 0) {
    root.append(el('h2', {}, ['Stojí za to overiť']));
    for (const lead of report.leads) {
      const parts: Node[] = [
        el('p', {}, [lead.prompt]),
        el('p', { class: 'because' }, [lead.because]),
      ];
      if (lead.moreInfoUrl) {
        parts.push(
          el('p', {}, [
            el('a', { href: lead.moreInfoUrl, rel: 'noopener' }, ['Viac informácií']),
          ]),
        );
      }
      root.append(el('div', { class: 'card lead' }, parts));
    }
  }

  const again = el('button', { class: 'primary', type: 'button' }, ['Začať odznova']);
  again.addEventListener('click', () => {
    for (const key of Object.keys(answers)) delete answers[key];
    render();
  });

  root.append(
    again,
    el('footer', {}, [
      el('p', { class: 'muted' }, [
        'Toto nie je rozhodnutie úradu a nie je to právne poradenstvo. ' +
          'O nároku rozhoduje príslušný úrad na základe vašej žiadosti a dokladov.',
      ]),
      el('p', { class: 'muted' }, [
        'Vaše odpovede neopustili toto zariadenie. Neposielame ich na server ' +
          'a neukladáme ich.',
      ]),
    ]),
  );

  focusHeading();
}

function renderIntro(): void {
  clear();
  if (!root) return;

  const start = el('button', { class: 'primary', type: 'button' }, ['Začať']);
  start.addEventListener('click', () => {
    started = true;
    render();
  });

  root.append(
    el('h1', {}, ['Na čo máte nárok']),
    el('p', { class: 'lede' }, [
      'Niekoľko otázok a zistíte, ktoré sociálne dávky sa na vás môžu ' +
        'vzťahovať, koľko to je a kde o ne požiadať.',
    ]),
    el('p', {}, [
      'Otázok je málo — pýtame sa len to, čo pri vašej situácii naozaj ' +
        'rozhoduje. Kto nemá deti, nedostane ani jednu otázku o deťoch.',
    ]),
    start,
    el('p', { class: 'muted' }, [
      'Nepotrebujeme meno ani e-mail. Odpovede zostávajú vo vašom zariadení — ' +
        'výpočet beží priamo v prehliadači a nikam sa neposiela.',
    ]),
  );

  focusHeading();
}

let started = false;

function render(): void {
  if (!started) {
    renderIntro();
    return;
  }
  const question = nextQuestion(answers);
  if (question) {
    renderQuestion(question);
    return;
  }
  renderResult();
}

render();
