# narok

Combined entitlement screening: answer a short set of questions, find out which
social benefits you are entitled to, what each is worth, and where and how to
claim it. Slovakia first, Czechia as a sibling package later.

## The state of this repository

The machinery works and is tested. **The law in it is not finished and none of
the numbers have been checked**, so in production the engine answers nothing.
That is enforced in code, not left to discipline — see *Two gates* below.

What is done:

- the engine: dated parameters, benefit evaluation, reasoning trace, leads
- two Slovak benefits as drafts, with real legal references
- "where and how to claim" with documents to bring, per benefit
- "below the line" prompts for entitlements the engine cannot decide
- the question graph: asks what eliminates, skips what cannot matter
- the browser app, 24 kB, no framework, nothing stored
- 139 tests, type-checked, built and smoke-tested on every push

What is not:

- every parameter is `verified: false` and several are literal placeholders
- both benefits are `maturity: 'draft'`
- no filled-in PDF to take to the office yet
- no batch screening for municipalities yet

## Why there is no OpenFisca here

OpenFisca was the obvious starting point and it is the right tool for national
microsimulation. It is the wrong tool for this:

- it is Python with numpy, which does not fit comfortably in a serverless
  function, so it would force a separate always-on server from day one
- it cannot run in the browser, and running the rules on the visitor's own
  device is the strongest privacy guarantee this product can offer
- its vectorised design pays off over millions of households; screening a
  municipality's four thousand is trivial in any language

The parameter tables and test cases are kept in a shape that ports, so if
OpenFisca ever becomes worth it, only the formulas get rewritten.

## Two gates

Both are enforced in `src/engine/simulate.ts` and both are tested.

**The verification gate.** Every parameter carries the `source` it came from and
a `verified` flag. In production, a benefit that reads even one unverified
parameter returns `status: 'unverified'` and no amount.

**The maturity gate.** Checked numbers are not the same as finished rules. A
benefit whose logic a domain expert has not signed off is `maturity: 'draft'`
and returns `status: 'draft'` in production, before its code even runs.

There is a third, narrower case. If a parameter exists but has no value for the
period being assessed, the result is `unverified` with a `parameter-gap` trace
step — never `not-eligible`. Not knowing is not the same as refusing.

## Verifying a parameter

`rules/sk/SOURCES.md` is the sourcing map: which act, decree and authority page
each benefit needs, and why the application form is the right thing to open
first. Start there for anything not yet modelled.

One parameter at a time, with a test for each:

1. Open the parameter's `source` in `rules/sk/parameters.yaml`. The numbers live
   in YAML, not TypeScript, so checking a figure against a decree does not mean
   reading code.
2. Confirm every value **and every commencement date**. The act fixes the
   entitlement; the amounts are set by decree and re-set most years, often from
   1 January or 1 July. The act alone will not give you the current figure.
3. Set `verified: true`, fill in `verified_by` and `verified_on`, and drop
   `placeholder` if it was there.
4. Run `npm run rules`. It validates the file and recompiles the pack; the
   committed JSON is what the app actually uses, and a test fails if the two
   drift apart.
5. Add a worked example to the test suite, taken from official guidance rather
   than from your own reading of the rule.

The validator rejects a key it does not recognise rather than ignoring it. A
silently dropped `verifed: true` would leave a number unchecked while looking
signed off, and the first sign of it would be a wrong answer given to somebody
about their rent.

Promoting a benefit from `draft` to `reviewed` is a bigger step and needs
somebody who knows the practice, not just the text. The exceptions are where
the damage lives.

## Why the harm rule shapes the design

A wrong "you qualify" costs somebody a morning off work. A wrong amount is
worse: if a benefit is paid on the strength of it and later clawed back, the
recovery lands on a household for whom a couple of hundred euros is the
difference between making rent and not.

Hence: results are always provisional, every line shows the rule and the source
behind it, and a claim is never submitted without the person seeing the
reasoning. And hence the two gates, which exist to make "we are not sure" the
default rather than an afterthought.

## Privacy

The consumer screening needs no database. `screenSk` is pure and synchronous,
so the browser build runs it locally and the household's income and health
facts never leave the device. The API function exists for batch and
server-rendered use; it persists nothing and logs no request bodies.

Health is modelled as the administrative fact the law keys on — does a
disability card exist, is a long-term illness certified — not as a condition or
a diagnosis. It is still special-category data under GDPR Art. 9, so it is
asked only where a benefit needs it.

No language model sits in the decision path, and none is called from this
repository. A model may later narrate a trace or help draft a candidate rule for
a human to check; it never decides an entitlement, because an entitlement has to
be reproducible in front of a caseworker.

## Layout

```
rules/sk/
└── parameters.yaml   THE NUMBERS. Source of truth, edited by hand.
src/
├── engine/           jurisdiction-agnostic
│   ├── types.ts      situation, outcome, lead, the gates' statuses
│   ├── parameters.ts dated parameter resolution
│   └── simulate.ts   evaluation, trace, lead suppression
├── rules/sk/         the Slovak package
│   ├── parameters.ts adapts the compiled pack to the engine's types
│   ├── generated/    compiled from the YAML — never edited by hand
│   ├── benefits/     one file per benefit
│   ├── leads.ts      below-the-line prompts
│   └── offices.ts    where to claim, what to bring
├── intake/           the question graph
├── web/main.ts       the browser app
├── server/screen.ts  HTTP handler — NOT deployed, seed of the batch product
└── index.ts          screenSk()
web/index.html        page shell, styles inline
scripts/              rule compiler, build, post-deploy checks
tests/                139 tests
```

Numbers in YAML, logic in TypeScript. The amounts change yearly by decree and
the logic changes rarely by amendment, so they move at different speeds and
belong in different files. The logic stays code because the exceptions are
where the damage lives, and a declarative format expressive enough to carry
Slovak social law ends up being a programming language with worse tooling.

Czechia goes in `src/rules/cz/`, not behind a flag in `sk/`. Entities,
parameters and the structure of the benefits all differ; a shared package would
put a country condition inside every rule and make the tests unreadable.
Separate packages also mean a Czech mistake cannot break Slovakia.

## Running it

```bash
npm install
npm run rules     # validate the YAML and compile the rule pack
npm test          # 139 tests
npm run typecheck
npm run build     # static site into dist/, with a size budget
npm run verify    # all of the above, in order
npm run dev       # build and serve dist/ locally
```

## Deployment

GitHub Pages on `mojedavky.sk`, published by Actions and gated on the test
suite. No third-party host, no server, no secrets to rotate — Pages deploys with
the workflow's own token. See DEPLOY.md.

There is no server because there is nothing for one to do. The engine is bundled
into the page and the screening runs in the browser, so no personal data is ever
transmitted. That also settles the hosting-location question: there is no point
arguing about which country the files sit in when the files are a questionnaire
and the answers never leave the phone.

## Offices

No phone number in `offices.ts` is invented. Each office carries a locator URL
instead, because a wrong number sends somebody to a dead line and costs more
trust than an absent one. Fill `phone` in only from the authority's own page and
set `contactVerified` when you do.
