#!/usr/bin/env node
/**
 * Post-deploy smoke test: does the live deployment still refuse to answer?
 *
 * The unit tests prove the gates work in the repository. This proves they work
 * in whatever got deployed, which is not the same claim — a build step, an
 * environment variable or a stray `mode: 'development'` could undo them
 * between here and there.
 *
 * It asserts the *current* intended state: nothing is verified, so nothing is
 * entitled. Once real benefits are verified and reviewed this check has to be
 * updated along with them. If it fails and you did not just verify something,
 * a gate has gone missing — do not deploy over it.
 *
 * Usage: node scripts/smoke-gates.mjs https://deployment-url
 */

const base = process.argv[2];

if (!base) {
  console.error('Usage: node scripts/smoke-gates.mjs <deployment-url>');
  process.exit(2);
}

const endpoint = new URL('/api/screen', base).toString();

// A household that would obviously qualify for a child allowance if the rule
// base were finished. The right answer today is "we do not know".
const situation = {
  period: '2026-08',
  persons: [
    { id: 'p1', role: 'applicant', ageYears: 34, incomeMonthly: 820 },
    { id: 'c1', role: 'child', ageYears: 6, incomeMonthly: 0, isDependentChild: true },
    { id: 'c2', role: 'child', ageYears: 11, incomeMonthly: 0, isDependentChild: true },
  ],
  household: { tenure: 'tenant', housingCostMonthly: 430, registeredPersons: 3 },
};

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`ok    ${message}`);
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(situation),
});

if (!response.ok) {
  fail(`POST ${endpoint} returned ${response.status}`);
  process.exit(1);
}

const report = await response.json();

if (!Array.isArray(report.outcomes) || report.outcomes.length === 0) {
  fail('the response carried no outcomes at all');
  process.exit(1);
}
pass(`the endpoint answered with ${report.outcomes.length} outcomes`);

const entitled = report.outcomes.filter((o) => o.status === 'eligible');
if (entitled.length > 0) {
  fail(
    `the live deployment claimed ${entitled.length} entitlement(s) while the rule base is unverified: ` +
      entitled.map((o) => `${o.benefitId}=${o.amountMonthly}`).join(', '),
  );
} else {
  pass('no entitlement was claimed');
}

if (report.totalMonthly !== 0) {
  fail(`totalMonthly is ${report.totalMonthly}, expected 0 while nothing is verified`);
} else {
  pass('totalMonthly is 0');
}

if (report.hasUnverified !== true) {
  fail('hasUnverified is not true, so the gates did not report themselves');
} else {
  pass('the response admits it is unverified');
}

if (Array.isArray(report.actionable) && report.actionable.length > 0) {
  fail('the deployment offered actionable claims built on unverified rules');
} else {
  pass('nothing actionable was offered');
}

const gated = report.outcomes.filter((o) => o.status === 'draft' || o.status === 'unverified');
if (gated.length !== report.outcomes.length) {
  const other = report.outcomes.filter((o) => !gated.includes(o)).map((o) => o.status);
  fail(`some outcomes bypassed both gates: ${other.join(', ')}`);
} else {
  pass('every outcome went through a gate');
}

if (process.exitCode === 1) {
  console.error('\nThe deployed build is answering when it should not. Roll it back.');
} else {
  console.log('\nGates intact on the live deployment.');
}
