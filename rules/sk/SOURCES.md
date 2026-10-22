# Where the Slovak rules come from

This answers one question: when you sit down to model a benefit, what do you
open, and in what order.

The short version is that no single document contains a benefit. Each one is
spread across three, kept by three different bodies, changing at three
different rates — and the one that decides most edge cases is not written down
at all.

## The three documents

| | What it gives you | Who keeps it | How often it changes |
|---|---|---|---|
| **The act** | who qualifies, and the shape of the calculation | Slov-lex | rarely, by amendment |
| **The decree** (opatrenie / nariadenie vlády) | the amounts | Slov-lex, Zbierka | most years, usually 1 Jan or 1 Jul |
| **The authority's own pages and forms** | what you must prove, where, with what | ÚPSVR, Sociálna poisťovňa, Finančná správa | quietly, any time |

The trap is the second row. The act names an entitlement and then says the sum
is set by decree. Reading only the act gives you a rule with a hole where the
number should be, and the figure you find by searching is usually last year's.
This is why `parameters.yaml` keeps the amount and its commencement date
together, and why verifying a parameter means confirming **both**.

## Work in this order, not in legal order

Reading the act first is the obvious approach and the slow one. Acts are
written for people who already know the system, the amounts are not in them,
and you cannot tell from the text which conditions actually decide cases.

1. **Start from the application form.** The official žiadosť is the authority's
   own enumeration of every fact it needs to decide. It is two or three pages
   instead of forty, it is already in the applicant's language, and it is
   effectively a fact catalogue validated by the state. For this project it
   maps almost one-to-one onto the intake questions — if a form does not ask
   it, we probably should not either.
2. **Then the authority's plain-language page.** How the conditions are
   actually applied, and usually the current amount. Treat the amount as a
   cross-check, not a citation.
3. **Then the act**, to resolve what the first two left ambiguous, and to cite.
4. **Then the decree**, for the number and the date it took effect. This is the
   only citation that may back an amount.

## The register

Every act below was opened on Slov-lex and its title read off the page. The
office column is who decides the claim, which is also who the result page must
send the person to.

| Benefit | Act | Office |
|---|---|---|
| Prídavok na dieťa | [600/2003 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/600/) | ÚPSVR |
| Rodičovský príspevok | [571/2009 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2009/571/) | ÚPSVR |
| Príspevok pri narodení dieťaťa, príspevok na viac súčasne narodených detí | [383/2013 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2013/383/) | ÚPSVR |
| Príspevky na podporu náhradnej starostlivosti o dieťa | [627/2005 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2005/627/) | ÚPSVR |
| Náhradné výživné | [201/2008 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2008/201/) | ÚPSVR |
| Pomoc v hmotnej núdzi, vrátane príspevku na bývanie | [417/2013 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2013/417/) | ÚPSVR |
| Peňažné príspevky na kompenzáciu ŤZP, opatrovateľský príspevok | [447/2008 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2008/447/) | ÚPSVR |
| Dotácie v pôsobnosti MPSVR (strava, školské potreby) | [544/2010 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2010/544/) | ÚPSVR, obec |
| Nemocenské, materské, dávka v nezamestnanosti, dôchodky | [461/2003 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/461/) | Sociálna poisťovňa |
| Daňový bonus na dieťa | [595/2003 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/595/) | Finančná správa |

And one that is not a benefit but sets the threshold several of them are
measured against:

| | Act |
|---|---|
| Životné minimum | [601/2003 Z. z.](https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/601/) |

Two groups differ from the rest and are worth separating early:

- **Sociálna poisťovňa benefits (461/2003)** are *insurance*, not assistance.
  Entitlement turns on contribution history, not on household need, and the
  facts needed are completely different. They are the ones people most often
  miss, and the hardest to screen from a questionnaire.
- **ŤZP compensations (447/2008)** turn on a *posudok* — an assessment. No
  amount of household data decides them, because a medical and social
  assessment does. These can only ever be leads in this product, never
  computed outcomes.

## The forms

ÚPSVR publishes the forms as PDFs. These are the starting point for each
benefit, per the order above.

| Form | URL |
|---|---|
| Žiadosť o prídavok na dieťa | `upsvr.gov.sk/buxus/docs/SSVaR/statne_soc.davky/Ziadost_o_pridavok_na_dieta_092025.pdf` |
| Žiadosť o príplatok k prídavku na dieťa | `upsvr.gov.sk/buxus/docs/SSVaR/tlaciva/Ziadost_o_priplatok_k_PnD.pdf` |
| Žiadosť o prídavok na ďalšie dieťa | `upsvr.gov.sk/buxus/docs/SSVaR/tlaciva/Ziadost_o_PnD_dalsie_dieta.pdf` |
| Žiadosť o rodičovský príspevok | `upsvr.gov.sk/buxus/docs/SSVaR/statne_soc.davky/Ziadost_o_rodicovsky_prispevok.pdf` |
| Poučenie pre občana žiadajúceho o ŠSD | `upsvr.gov.sk/buxus/docs/SSVaR/tlaciva/Poucenie_pre_obcana_ziadajuceho_o_SSD.pdf` |

The file name of the first carries its own revision date (`092025`), so a
newer one will appear under a different name rather than replacing it. Check
the ÚPSVR forms index rather than assuming this link stays current.

The **poučenie** is the most underrated document of the set. It is where the
reporting obligations are written out — what the claimant must tell the office
within eight days, from a change of school to a child turning three — and those
map directly onto what a result page should tell somebody *after* they claim.
It also describes the *osobitný príjemca*, where the benefit is paid to the
municipality instead of the parent, which no act summary mentions.

### What the child allowance form settled

Reading it changed three things in the model:

- **There is no income question on it.** Prídavok na dieťa is not means-tested,
  so asking household income before it is simply asking for something that
  benefit cannot use. The ordering of the intake has to follow from which
  benefit needs what, not from a general sense of what a benefits app asks.
- **Dependency is evidenced by the school**, not asserted. The form asks which
  school the child attends and the office draws the conclusion. We ask for the
  conclusion, because a screening cannot verify an enrolment — one more reason
  this benefit stays `draft`.
- **Residence and cross-border status is a first-class fact**, and we model
  none of it. The form has three address blocks — permanent in SK, temporary in
  SK, and residence in another EU state — plus a "social status and country"
  section for both the applicant and the second eligible person. That is EU
  Regulation 883/2004 coordination. For a household living and working only in
  Slovakia it collapses to nothing, which is why it can wait; but it is the
  likeliest reason for the office to decide differently from this app.

## Citing a dated version

Slov-lex serves the consolidated text as it stood on a given day, and puts the
date in the URL:

```
https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/600/20260101
                                                               ^^^^^^^^
```

Cite the dated URL, not the bare one. A bare link silently becomes a link to a
different text the next time the act is amended, which would leave a verified
parameter pointing at wording that no longer says what it was checked against.

The portal needs JavaScript; `static.slov-lex.sk` serves the same documents
without it, which is also what to use if these citations are ever checked
automatically.

## Cross-checks

Never a citation, but useful for catching a transcription error before it ships:

- **MISSOC**, the EU's comparative social-protection tables, carries Slovak
  benefit descriptions and amounts in a structured form, updated twice a year.
  Entry point via [MPSVR](https://www.mpsvr.sk/sk/ministerstvo/medzinarodna-spolupraca/europska-unia/missoc/);
  the tables themselves are now hosted by the European Commission.
- The authority's own summary page for the benefit.

If a figure you transcribed disagrees with either, stop and find the decree.
Two independent sources agreeing is weak evidence; both are usually copying the
same place.

## What no document will tell you

How a case is actually decided at the counter. Which proofs are accepted, how a
household is counted when somebody is registered at an address but does not
live there, what happens in the month a child turns 25. This is the practice,
it is not published, and it is where a confident wrong answer comes from.

This is the whole reason for `maturity: 'draft'`. Promoting a benefit to
`reviewed` needs somebody who has decided these cases — a benefits counsellor,
a current or former ÚPSVR caseworker, an NGO that does this advice work. A few
hours of their time per benefit is far cheaper than being wrong in public.

ÚPSVR also answers questions in writing, and a written answer is citable.

## Keeping it from rotting

Two things decay on their own:

- **Amounts**, every January and July. Verification is not a one-off; a
  `verified: true` from two years ago is a stale number wearing a badge.
- **Links.** The ministry moved from `employment.gov.sk` to `mpsvr.sk` and the
  old domain now redirects. A citation that 404s breaks the promise that every
  line shows its source, and nothing currently notices.

A monthly job that fetches every `source` URL and fails on a non-200 would
catch the second. It has to run in CI rather than locally, because the
development sandbox cannot reach these sites.
