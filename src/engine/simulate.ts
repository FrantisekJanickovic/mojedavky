/**
 * Runs a household's facts through every benefit and every lead.
 *
 * The engine is deterministic and side-effect free: same facts in, same answer
 * out, with a trace that explains it. No language model sits anywhere in this
 * path. A model may later narrate the trace or help draft a rule, but it never
 * decides an entitlement, because an entitlement has to be reproducible and
 * defensible in front of a caseworker.
 */

import type {
  Benefit,
  EngineMode,
  EvaluationContext,
  Lead,
  Outcome,
  Person,
  ScreeningResult,
  Situation,
  TraceStep,
} from './types.js';
import { NoValueForPeriodError, type ParameterTable } from './parameters.js';

export interface LeadRule {
  id: string;
  prompt: string;
  because: string;
  office: Lead['office'];
  moreInfoUrl?: string;
  /**
   * Registered facts `when` consults. Declared rather than inferred, because a
   * lead that quietly depends on a fact nobody asks for would simply never
   * fire — the least visible way for this product to fail.
   */
  reads: string[];
  /** True when this is worth raising for this household. */
  when(situation: Situation): boolean;
  /**
   * Benefit ids this lead duplicates. When one of them already came out as an
   * entitlement, the lead is suppressed: telling somebody to go and check a
   * thing they have just been told they qualify for reads as noise.
   */
  supersededBy?: string[];
}

export interface Registry {
  benefits: Benefit[];
  leads: LeadRule[];
  parameters: ParameterTable;
}

export interface ScreenOptions {
  mode?: EngineMode;
}

function sortOutcomes(a: Outcome, b: Outcome): number {
  const rank: Record<Outcome['status'], number> = {
    eligible: 0,
    'needs-more-info': 1,
    unverified: 2,
    draft: 3,
    'not-eligible': 4,
  };
  const byStatus = rank[a.status] - rank[b.status];
  if (byStatus !== 0) return byStatus;
  return (b.amountMonthly ?? 0) - (a.amountMonthly ?? 0);
}

export function screen(
  situation: Situation,
  registry: Registry,
  options: ScreenOptions = {},
): ScreeningResult {
  const mode: EngineMode = options.mode ?? 'production';
  const outcomes: Outcome[] = [];

  for (const benefit of registry.benefits) {
    outcomes.push(evaluateBenefit(benefit, situation, registry, mode));
  }

  const eligibleIds = new Set(
    outcomes.filter((o) => o.status === 'eligible').map((o) => o.benefitId),
  );

  const leads: Lead[] = [];
  for (const rule of registry.leads) {
    const superseded = (rule.supersededBy ?? []).some((id) => eligibleIds.has(id));
    if (superseded) continue;

    let applies = false;
    try {
      applies = rule.when(situation);
    } catch {
      // A broken lead rule must never take down the screening: the benefits
      // are the product, the leads are a hint.
      applies = false;
    }
    if (!applies) continue;

    const lead: Lead = {
      id: rule.id,
      prompt: rule.prompt,
      because: rule.because,
      office: rule.office,
    };
    if (rule.moreInfoUrl !== undefined) lead.moreInfoUrl = rule.moreInfoUrl;
    leads.push(lead);
  }

  outcomes.sort(sortOutcomes);

  const totalMonthly = outcomes
    .filter((o) => o.status === 'eligible')
    .reduce((sum, o) => sum + (o.amountMonthly ?? 0), 0);

  return {
    period: situation.period,
    outcomes,
    leads,
    totalMonthly: round2(totalMonthly),
    hasUnverified: outcomes.some((o) => o.status === 'unverified' || o.status === 'draft'),
  };
}

function evaluateBenefit(
  benefit: Benefit,
  situation: Situation,
  registry: Registry,
  mode: EngineMode,
): Outcome {
  const trace: TraceStep[] = [];
  const missingFacts: string[] = [];
  const unverified = new Set<string>();

  const ctx: EvaluationContext = {
    situation,
    mode,
    param(path: string): number {
      if (!registry.parameters.isVerified(path)) unverified.add(path);
      return registry.parameters.resolve(path, situation.period);
    },
    trace(step: TraceStep) {
      trace.push(step);
    },
    missing(fact: string) {
      if (!missingFacts.includes(fact)) missingFacts.push(fact);
    },
    applicant(): Person | undefined {
      return situation.persons.find((p) => p.role === 'applicant');
    },
    children(): Person[] {
      return situation.persons.filter((p) => p.role === 'child');
    },
    householdIncomeMonthly(): number {
      return round2(situation.persons.reduce((sum, p) => sum + (p.incomeMonthly ?? 0), 0));
    },
  };

  const base = {
    benefitId: benefit.id,
    benefitName: benefit.name,
    office: benefit.office,
    law: benefit.law,
  };

  // Draft logic is refused before it is even run: there is nothing to gain
  // from computing a number we are not prepared to stand behind.
  if (mode === 'production' && benefit.maturity === 'draft') {
    trace.push({
      rule: 'maturity-gate',
      detail:
        'The rules for this benefit are still a draft and have not been reviewed by a domain expert, so no result is shown.',
    });
    return { ...base, status: 'draft', trace };
  }

  let result: { eligible: boolean; amountMonthly?: number };
  try {
    result = benefit.evaluate(ctx);
  } catch (error) {
    // A parameter with no value for this period is not a bug in the rule and
    // not a question for the claimant: it means nobody has entered the figure
    // that was in force then. It gets its own answer, because the fix is to
    // fill the table — and because reporting it as a refusal would tell
    // somebody they are not entitled when we simply do not know.
    if (error instanceof NoValueForPeriodError) {
      trace.push({
        rule: 'parameter-gap',
        detail: `No amount has been entered for the period ${situation.period}: ${error.message}`,
      });
      return {
        ...base,
        status: 'unverified',
        unverifiedParameters: [...unverified, ...extractPath(error.message)],
        trace,
      };
    }

    // Any other thrown rule is a bug, not a decision. Report it as undecidable
    // rather than as a refusal: telling somebody "no" because of our own error
    // is the one outcome we must never produce.
    trace.push({
      rule: 'engine-error',
      detail: `The rule could not be evaluated: ${(error as Error).message}`,
    });
    return { ...base, status: 'needs-more-info', missingFacts: ['internal'], trace };
  }

  // Order matters. Unverified numbers outrank everything, because an answer
  // computed from an unchecked figure must not be shown at all in production.
  if (mode === 'production' && unverified.size > 0) {
    trace.push({
      rule: 'verification-gate',
      detail:
        'This benefit uses amounts that nobody has checked against the official source yet, so no result is shown.',
    });
    return {
      ...base,
      status: 'unverified',
      unverifiedParameters: [...unverified],
      trace,
    };
  }

  if (missingFacts.length > 0) {
    return { ...base, status: 'needs-more-info', missingFacts, trace };
  }

  if (!result.eligible) {
    return { ...base, status: 'not-eligible', trace };
  }

  const outcome: Outcome = { ...base, status: 'eligible', trace };
  if (result.amountMonthly !== undefined) {
    outcome.amountMonthly = round2(result.amountMonthly);
  }
  if (unverified.size > 0) {
    // Development mode still answers, but says what it leaned on.
    outcome.unverifiedParameters = [...unverified];
  }
  return outcome;
}

/** Pull the parameter path out of a NoValueForPeriodError message. */
function extractPath(message: string): string[] {
  const match = /^Parameter (\S+) has no value/.exec(message);
  return match?.[1] ? [match[1]] : [];
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
