/**
 * Dated parameter table.
 *
 * A parameter is a number with a history, a source and a verification flag.
 * Resolving one means asking "what was this worth in March 2025", which is the
 * question a benefit claim actually poses — claims are routinely assessed for
 * past months.
 */

import type { Period } from './types.js';

export interface ParameterValue {
  /** First day this value applies, `YYYY-MM-DD`. */
  from: string;
  value: number;
}

/**
 * What kind of quantity a parameter is.
 *
 * Without this nothing distinguishes €30 a month from an age limit of 25, and
 * a results page that formats every number as euros would say a child is
 * "25 €" old.
 */
export type ParameterUnit = 'eur' | 'years' | 'count' | 'percent';

export interface ParameterDefinition {
  /** Dot path, e.g. `pridavok.zakladna-suma`. */
  path: string;
  /** What this number is, in one line. */
  description: string;
  unit: ParameterUnit;
  /** Where the number comes from. A URL to the act, decree or official table. */
  source: string;
  /** Key of that source within the pack, for grouping and for fixing links. */
  sourceKey?: string;
  /**
   * True when the number is a stand-in nobody has supplied yet.
   *
   * A placeholder is usually written as zero, and zero is also a legitimate
   * value for some parameters, so the distinction cannot be inferred from the
   * number. Saying it outright is what lets the integrity report separate "we
   * have not filled this in" from "this really is nil".
   */
  placeholder?: boolean;
  /**
   * Set to true only once a human has opened `source` and confirmed every
   * value below against it. Until then the engine will not answer with it in
   * production.
   */
  verified: boolean;
  /** Who checked it and when, for the audit trail. */
  verifiedBy?: string;
  verifiedOn?: string;
  /** Values over time, in any order. */
  values: ParameterValue[];
}

export class UnknownParameterError extends Error {
  constructor(path: string) {
    super(`Unknown parameter: ${path}`);
    this.name = 'UnknownParameterError';
  }
}

export class NoValueForPeriodError extends Error {
  constructor(path: string, period: Period) {
    super(`Parameter ${path} has no value for ${period}`);
    this.name = 'NoValueForPeriodError';
  }
}

/** First day of the month a period denotes. */
function periodStart(period: Period): string {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`Period must be YYYY-MM, got: ${period}`);
  }
  return `${period}-01`;
}

export class ParameterTable {
  private readonly byPath = new Map<string, ParameterDefinition>();

  constructor(definitions: ParameterDefinition[]) {
    for (const def of definitions) {
      if (this.byPath.has(def.path)) {
        throw new Error(`Duplicate parameter definition: ${def.path}`);
      }
      if (def.values.length === 0) {
        throw new Error(`Parameter ${def.path} has no values`);
      }
      this.byPath.set(def.path, def);
    }
  }

  has(path: string): boolean {
    return this.byPath.has(path);
  }

  definition(path: string): ParameterDefinition {
    const def = this.byPath.get(path);
    if (!def) throw new UnknownParameterError(path);
    return def;
  }

  /**
   * Value in force during `period`.
   *
   * The latest value whose `from` is not after the start of the period wins,
   * which is how commencement dates work: a decree effective 1 July applies to
   * July onwards and leaves June alone.
   */
  resolve(path: string, period: Period): number {
    const def = this.definition(path);
    const start = periodStart(period);

    let best: ParameterValue | undefined;
    for (const candidate of def.values) {
      if (candidate.from <= start && (!best || candidate.from > best.from)) {
        best = candidate;
      }
    }

    if (!best) throw new NoValueForPeriodError(path, period);
    return best.value;
  }

  isVerified(path: string): boolean {
    return this.definition(path).verified;
  }

  /** Every parameter still awaiting human verification. */
  unverifiedPaths(): string[] {
    return [...this.byPath.values()].filter((d) => !d.verified).map((d) => d.path);
  }

  all(): ParameterDefinition[] {
    return [...this.byPath.values()];
  }
}
