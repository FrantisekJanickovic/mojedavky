/**
 * @vitest-environment jsdom
 *
 * Drives the real app module against a real DOM.
 *
 * The point is the whole journey: start, answer the questions that are actually
 * asked, and arrive at a result. A screening tool that calculates correctly and
 * cannot be completed is worth nothing, and that failure mode does not show up
 * in any unit test of the engine.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Fresh DOM and a fresh module instance for each test. */
async function mount(): Promise<void> {
  document.body.innerHTML = '<main id="app"></main>';
  vi.resetModules();
  await import('../src/web/main.js');
}

function app(): HTMLElement {
  return document.getElementById('app')!;
}

function text(): string {
  return app().textContent ?? '';
}

function buttons(): HTMLButtonElement[] {
  return [...app().querySelectorAll('button')];
}

function clickText(label: string | RegExp): void {
  const match = buttons().find((b) =>
    typeof label === 'string' ? b.textContent?.includes(label) : label.test(b.textContent ?? ''),
  );
  if (!match) {
    throw new Error(`No button matching ${label}. Buttons: ${buttons().map((b) => b.textContent).join(' | ')}`);
  }
  match.click();
}

function currentLegend(): string {
  return app().querySelector('legend')?.textContent ?? '';
}

/** Answer whichever numeric question is on screen. */
function answerNumber(value: number): void {
  const input = app().querySelector<HTMLInputElement>('input[type="number"]');
  if (!input) throw new Error(`No number input. On screen: ${currentLegend()}`);
  input.value = String(value);
  app().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

beforeEach(async () => {
  await mount();
});

describe('the intro', () => {
  it('explains the point before asking anything', () => {
    expect(text()).toContain('Na čo máte nárok');
    expect(buttons().some((b) => b.textContent === 'Začať')).toBe(true);
  });

  it('promises up front that nothing leaves the device', () => {
    expect(text()).toMatch(/zostávajú vo vašom zariadení/i);
  });

  it('asks no question until the person starts', () => {
    expect(app().querySelector('legend')).toBeNull();
  });
});

describe('a single pensioner can finish', () => {
  it('reaches a result without ever being asked about children', () => {
    clickText('Začať');

    // Q1 is the child count — the question that eliminates the most.
    expect(currentLegend()).toMatch(/Koľko detí/);
    answerNumber(0);

    const seen: string[] = [];
    for (let step = 0; step < 12; step++) {
      const legend = currentLegend();
      if (legend === '') break;
      seen.push(legend);

      if (app().querySelector('input[type="number"]')) {
        answerNumber(520);
      } else {
        // Take the first offered choice.
        const choice = app().querySelector<HTMLButtonElement>('button.choice');
        if (!choice) break;
        choice.click();
      }
    }

    expect(text()).toContain('Čo sme zistili');
    // Never asked anything about children beyond the count.
    expect(seen.join(' ')).not.toMatch(/nezaopatrené|zdravotný stav dieťaťa/i);
  });
});

describe('the result page is honest about what it does not know', () => {
  function completeFlow(): void {
    clickText('Začať');
    for (let step = 0; step < 14; step++) {
      if (currentLegend() === '') break;
      if (app().querySelector('input[type="number"]')) {
        answerNumber(2);
      } else {
        app().querySelector<HTMLButtonElement>('button.choice')!.click();
      }
    }
  }

  it('says plainly that some benefits cannot be calculated yet', () => {
    completeFlow();
    expect(text()).toContain('Čo sme zistili');
    expect(text()).toMatch(/zatiaľ nespočítame/i);
    expect(text()).toMatch(/radšej vám nepovieme nič/i);
  });

  it('claims no entitlement and shows no euro amount while the rules are gated', () => {
    completeFlow();
    expect(text()).not.toContain('Máte nárok');
    expect(text()).not.toMatch(/\d+[.,]\d\d\s*€\s*mesačne/);
  });

  it('still points at the office for every benefit it could not decide', () => {
    completeFlow();
    const links = [...app().querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(links.some((href) => href.includes('upsvr.gov.sk'))).toBe(true);
  });

  it('shows the leads, which need no verified amounts', () => {
    completeFlow();
    expect(text()).toContain('Stojí za to overiť');
    // Asserted on the content rather than on a class name: the layout carries
    // no boxes to count, and a lead is only worth anything if its reason is
    // on screen next to it.
    expect(text()).toMatch(/daňový bonus|preukaz ŤZP|evidencia/i);
    expect(app().querySelectorAll('.entry').length).toBeGreaterThan(0);
  });

  it('states it is not a decision and not legal advice', () => {
    completeFlow();
    expect(text()).toMatch(/nie je rozhodnutie úradu/i);
    expect(text()).toMatch(/neopustili toto zariadenie/i);
  });

  it('can be restarted, and forgets the answers', () => {
    completeFlow();
    expect(text()).toContain('Čo sme zistili');

    clickText('Začať odznova');

    // Straight back to the first question rather than the intro: the person
    // already knows what this is, so making them click through the pitch again
    // would be friction for nothing.
    expect(currentLegend()).toMatch(/Koľko detí/);
    expect(text()).not.toContain('Čo sme zistili');

    // And the previous answers are genuinely gone — the field is empty and the
    // flow starts from the top rather than resuming near the end.
    expect(app().querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('');
    const bar = app().querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('going back', () => {
  it('returns to the previous question and forgets its answer', () => {
    clickText('Začať');
    expect(currentLegend()).toMatch(/Koľko detí/);
    answerNumber(0);

    const second = currentLegend();
    expect(second).not.toBe('');

    clickText('Späť');
    expect(currentLegend()).toMatch(/Koľko detí/);
    // Forgotten, not merely hidden: the field is empty again.
    expect(app().querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('');
  });

  it('leaves the survey when there is nothing left to go back to', () => {
    clickText('Začať');
    clickText('Späť');
    expect(app().querySelector('legend')).toBeNull();
    expect(text()).toContain('Ako to funguje');
  });
});

describe('the progress bar adapts instead of counting steps', () => {
  function percentNow(): number {
    const bar = app().querySelector('[role="progressbar"]')!;
    return Number(bar.getAttribute('aria-valuenow'));
  }

  it('shows no step count, which would be a promise about a moving total', () => {
    clickText('Začať');
    expect(text()).not.toMatch(/krok \d+ z \d+/i);
    expect(text()).not.toMatch(/otázka \d+ z \d+/i);
  });

  it('retreats when an answer opens more questions', async () => {
    // One answer in, having said there are no children, the end is closer than
    // it is for somebody who has just said there are two — because saying two
    // created questions that did not exist a moment ago. The bar follows the
    // real denominator rather than pretending the path never changed.
    clickText('Začať');
    answerNumber(0);
    const withoutChildren = percentNow();

    await mount();
    clickText('Začať');
    answerNumber(2);
    const withChildren = percentNow();

    expect(withChildren).toBeLessThan(withoutChildren);
  });
});

describe('accessibility basics', () => {
  it('announces each step by moving focus to the heading', () => {
    clickText('Začať');
    expect(document.activeElement?.tagName.toLowerCase()).toBe('legend');
  });

  it('reports progress to assistive technology', () => {
    clickText('Začať');
    const bar = app().querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('aria-valuemax')).toBeTruthy();
  });

  it('refuses an empty numeric answer with a spoken error', () => {
    clickText('Začať');
    const input = app().querySelector<HTMLInputElement>('input[type="number"]')!;
    input.value = '';
    app().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    const alert = app().querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/zadajte číslo/i);
    // Still on the same question.
    expect(currentLegend()).toMatch(/Koľko detí/);
  });

  it('rejects a number outside the allowed range', () => {
    clickText('Začať');
    answerNumber(9999);
    expect(app().querySelector('[role="alert"]')?.textContent).toMatch(/medzi/i);
  });

  it('pre-fills nothing, so no answer is ever assumed', () => {
    clickText('Začať');
    expect(app().querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('');
  });
});

describe('nothing is persisted', () => {
  it('writes neither localStorage nor sessionStorage', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    clickText('Začať');
    answerNumber(1);
    // A borrowed or shared phone is a realistic situation here, and a restored
    // answer about somebody's income is a leak.
    expect(local).not.toHaveBeenCalled();
  });

  it('makes no network request', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    clickText('Začať');
    answerNumber(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
