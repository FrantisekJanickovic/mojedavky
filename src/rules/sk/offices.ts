/**
 * Where and how to claim.
 *
 * This is the part people actually came for. A number on a screen informs
 * somebody; a form, an address and a list of documents moves them. It is also
 * the cheapest part of the product to get right and the easiest to leave out.
 *
 * NO PHONE NUMBERS ARE INVENTED HERE. Every office carries a locator URL
 * instead, because a wrong phone number sends somebody to a dead line and
 * costs more trust than an absent one. Fill `phone` in only from the
 * authority's own page, and set `contactVerified` when you do.
 */

import type { OfficeKind } from '../../engine/types.js';

export interface OfficeInfo {
  kind: OfficeKind;
  /** Full name of the authority. */
  name: string;
  /** How the claim is made, in plain language. */
  how: string;
  /** Which office of this authority is competent. */
  whichBranch: string;
  /** Page listing branches with their addresses and contacts. */
  locatorUrl: string;
  /** Online route, where one exists. */
  onlineUrl?: string;
  /** Only ever from the authority's own page. */
  phone?: string;
  /** True once a human has checked name, URLs and any phone number. */
  contactVerified: boolean;
}

export const skOffices: Record<OfficeKind, OfficeInfo> = {
  upsvar: {
    kind: 'upsvar',
    name: 'Úrad práce, sociálnych vecí a rodiny',
    how: 'Písomnou žiadosťou na predpísanom tlačive — osobne, poštou, alebo elektronicky cez slovensko.sk.',
    whichBranch: 'Úrad podľa miesta trvalého pobytu žiadateľa.',
    locatorUrl: 'https://www.upsvr.gov.sk/kontakty/',
    onlineUrl: 'https://www.slovensko.sk/',
    contactVerified: false,
  },
  'socialna-poistovna': {
    kind: 'socialna-poistovna',
    name: 'Sociálna poisťovňa',
    how: 'Žiadosťou v pobočke alebo elektronicky; pri nemocenských dávkach spravidla prostredníctvom zamestnávateľa.',
    whichBranch: 'Pobočka podľa miesta trvalého pobytu alebo sídla zamestnávateľa.',
    locatorUrl: 'https://www.socpoist.sk/kontakty/',
    contactVerified: false,
  },
  obec: {
    kind: 'obec',
    name: 'Obec alebo mesto',
    how: 'Žiadosťou na obecnom alebo mestskom úrade; podmienky si určuje samospráva vo vlastnom predpise.',
    whichBranch: 'Obec trvalého pobytu.',
    locatorUrl: 'https://www.slovensko.sk/',
    contactVerified: false,
  },
  'financna-sprava': {
    kind: 'financna-sprava',
    name: 'Finančná správa Slovenskej republiky',
    how: 'Prostredníctvom zamestnávateľa v ročnom zúčtovaní, alebo vo vlastnom daňovom priznaní.',
    whichBranch: 'Daňový úrad podľa miesta trvalého pobytu.',
    locatorUrl: 'https://www.financnasprava.sk/sk/kontakt',
    contactVerified: false,
  },
  'zdravotna-poistovna': {
    kind: 'zdravotna-poistovna',
    name: 'Zdravotná poisťovňa',
    how: 'Oznámením alebo žiadosťou vlastnej zdravotnej poisťovni.',
    whichBranch: 'Poisťovňa, v ktorej je osoba poistená.',
    locatorUrl: 'https://www.udzs-sk.sk/',
    contactVerified: false,
  },
};

/** Documents to bring. Kept per benefit, since this is what varies. */
export const skRequiredDocuments: Record<string, string[]> = {
  'sk-pridavok-na-dieta': [
    'Občiansky preukaz žiadateľa',
    'Rodný list dieťaťa',
    'Potvrdenie o návšteve školy, ak dieťa už nie je v povinnom školskom veku',
    'Číslo účtu v tvare IBAN',
  ],
  'sk-prispevok-na-byvanie': [
    'Občiansky preukaz žiadateľa a dokladovanie ostatných členov domácnosti',
    'Doklad o právnom vzťahu k bývaniu — nájomná zmluva, list vlastníctva alebo potvrdenie družstva',
    'Doklady o príjmoch všetkých spoločne posudzovaných osôb',
    'Doklady o nákladoch na bývanie za posledné obdobie',
    'Číslo účtu v tvare IBAN',
  ],
};

export function officeFor(kind: OfficeKind): OfficeInfo {
  return skOffices[kind];
}

export function documentsFor(benefitId: string): string[] {
  return skRequiredDocuments[benefitId] ?? [];
}
