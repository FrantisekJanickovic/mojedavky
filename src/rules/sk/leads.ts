/**
 * Leads — the "below the line" prompts.
 *
 * A lead is not a weaker entitlement. It is a question worth asking, raised
 * because something in the household's facts suggests it, and it deliberately
 * carries no amount. The distinction matters: the moment a "worth checking"
 * starts looking like "you will get this", somebody takes a morning off work
 * for nothing, and the next thing they stop trusting is the parts we got right.
 *
 * Each lead says what triggered it (`because`), so it never reads as a guess.
 */

import type { LeadRule } from '../../engine/simulate.js';
import type { Situation } from '../../engine/types.js';

const children = (s: Situation) => s.persons.filter((p) => p.role === 'child');

export const skLeads: LeadRule[] = [
  {
    id: 'sk-predlzeny-rodicovsky',
    prompt:
      'Ak máte dlhodobo nepriaznivý zdravotný stav dieťaťa potvrdený posudkom, overte si nárok na predĺžený rodičovský príspevok.',
    because: 'V domácnosti je dieťa s potvrdeným dlhodobo nepriaznivým zdravotným stavom.',
    office: 'upsvar',
    moreInfoUrl: 'https://www.upsvr.gov.sk/socialne-veci-a-rodina/statne-socialne-davky/',
    when: (s) => children(s).some((c) => c.hasCertifiedLongTermIllness === true),
  },
  {
    id: 'sk-tzp-kompenzacie',
    prompt:
      'Pri preukaze ŤZP existuje samostatná skupina peňažných príspevkov na kompenzáciu — na osobnú asistenciu, na kúpu pomôcky, na prepravu a ďalšie. Posudzujú sa jednotlivo a nie sú súčasťou tohto prehľadu.',
    because: 'Niekto v domácnosti má preukaz ŤZP.',
    office: 'upsvar',
    moreInfoUrl: 'https://www.upsvr.gov.sk/socialne-veci-a-rodina/',
    when: (s) => s.persons.some((p) => p.hasDisabilityCard === true),
  },
  {
    id: 'sk-danovy-bonus',
    prompt:
      'Ak máte zdaniteľný príjem a dieťa, overte si daňový bonus na dieťa. Nevybavuje sa na úrade práce, ale cez zamestnávateľa alebo v daňovom priznaní.',
    because: 'V domácnosti je dieťa a aspoň jedna osoba s príjmom.',
    office: 'financna-sprava',
    moreInfoUrl: 'https://www.financnasprava.sk/',
    when: (s) => children(s).length > 0 && s.persons.some((p) => (p.incomeMonthly ?? 0) > 0),
  },
  {
    id: 'sk-byvanie-tesne-nad',
    prompt:
      'Váš príjem je blízko hranice hmotnej núdze a bývanie vás stojí značnú časť príjmu. Stojí za to dať si nárok prepočítať na úrade — do príjmu sa niektoré položky nezapočítavajú a hranica sa môže posunúť.',
    because:
      'Príjem domácnosti je nad hranicou, ale náklady na bývanie tvoria viac než tretinu príjmu.',
    office: 'upsvar',
    moreInfoUrl: 'https://www.upsvr.gov.sk/socialne-veci-a-rodina/pomoc-v-hmotnej-nudzi/',
    // Suppressed when the housing allowance already came out as an
    // entitlement: nobody needs to be told to go and check a thing they have
    // just been told they qualify for.
    supersededBy: ['sk-prispevok-na-byvanie'],
    when: (s) => {
      const cost = s.household.housingCostMonthly;
      if (cost === undefined || cost <= 0) return false;
      const income = s.persons.reduce((sum, p) => sum + (p.incomeMonthly ?? 0), 0);
      if (income <= 0) return false;
      return cost / income > 1 / 3;
    },
  },
  {
    id: 'sk-nezamestnany-neevidovany',
    prompt:
      'Ak ste bez práce a nie ste evidovaný na úrade práce, evidencia je podmienkou viacerých dávok aj platenia zdravotného poistenia štátom. Oplatí sa ju vybaviť aj vtedy, keď na podporu nárok nemáte.',
    because: 'Dospelá osoba bez príjmu, ktorá nie je evidovaná ako uchádzač o zamestnanie.',
    office: 'upsvar',
    moreInfoUrl: 'https://www.upsvr.gov.sk/sluzby-zamestnanosti/',
    when: (s) =>
      s.persons.some(
        (p) =>
          p.role !== 'child' &&
          (p.incomeMonthly ?? 0) === 0 &&
          p.isRegisteredJobseeker === false &&
          p.isPensioner !== true &&
          p.isStudent !== true &&
          p.isOnParentalLeave !== true,
      ),
  },
];
