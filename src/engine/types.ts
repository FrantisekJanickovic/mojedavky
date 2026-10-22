/**
 * Core types for the entitlement engine.
 *
 * Two ideas carry the whole design:
 *
 * 1. Rules and numbers are separate. A benefit's logic is code; the amounts and
 *    thresholds it uses are dated parameters. Governments change the numbers
 *    far more often than the logic, and they change them by decree, not by
 *    amending the act. Keeping them apart means a yearly update touches one
 *    table and nothing else.
 *
 * 2. Nothing is trusted until a human says so. Every parameter carries the
 *    source it came from and whether a person has checked it against that
 *    source. A production run refuses to answer using unverified numbers,
 *    because a confident wrong answer here costs somebody their rent.
 */

/** Calendar month a claim is assessed for, `YYYY-MM`. */
export type Period = string;

/** Which authority a claim is made to. */
export type OfficeKind =
  | 'upsvar'
  | 'socialna-poistovna'
  | 'obec'
  | 'financna-sprava'
  | 'zdravotna-poistovna';

export type PersonRole = 'applicant' | 'partner' | 'child' | 'other';

/**
 * One member of the household.
 *
 * Health is deliberately modelled as the administrative fact the law actually
 * keys on (does a disability card exist, is a long-term illness certified)
 * rather than as a condition or diagnosis. It is still special-category data
 * under GDPR Art. 9, so it is asked only where a benefit needs it and is never
 * persisted.
 */
export interface Person {
  id: string;
  role: PersonRole;
  /**
   * Age in whole years at the start of the assessed period.
   *
   * Optional, and absent rather than defaulted when unknown. It used to be
   * required, which meant the intake had to put *something* there — it put
   * zero for every child, and the age ceiling in the child allowance silently
   * stopped binding on anybody. A rule that needs an age now has to say so and
   * record a missing fact, which is the same treatment every other unknown
   * gets.
   */
  ageYears?: number;
  /** Gross monthly income in EUR from all sources. */
  incomeMonthly: number;
  /** Still in qualifying education / not yet self-supporting. */
  isDependentChild?: boolean;
  /** In full-time study. */
  isStudent?: boolean;
  /** Holds a certified disability card (ŤZP). */
  hasDisabilityCard?: boolean;
  /** Long-term adverse health condition of a child is certified. */
  hasCertifiedLongTermIllness?: boolean;
  /** Registered as a jobseeker. */
  isRegisteredJobseeker?: boolean;
  /** Drawing a pension. */
  isPensioner?: boolean;
  /** Personally and full-time caring for a child (parental leave). */
  isOnParentalLeave?: boolean;
}

export type Tenure = 'owner' | 'tenant' | 'cooperative' | 'other';

export interface Household {
  tenure?: Tenure;
  /** Monthly housing cost in EUR (rent plus utilities, or equivalent). */
  housingCostMonthly?: number;
  /** People with permanent residence registered at the address. */
  registeredPersons?: number;
  /** Municipality code, used to resolve the competent office. */
  municipalityCode?: string;
}

export interface Situation {
  period: Period;
  persons: Person[];
  household: Household;
}

/** One step of the reasoning, so an outcome can always be explained. */
export interface TraceStep {
  /** Short machine name of the check or computation. */
  rule: string;
  /** Plain-language statement of what was established. */
  detail: string;
  /** The value this step produced, when it produced one. */
  value?: number | boolean | string;
  /** Legal or official source for this step. */
  source?: string;
}

export type OutcomeStatus =
  /** Entitled, with an amount. */
  | 'eligible'
  /** Definitively not entitled, with the reason in the trace. */
  | 'not-eligible'
  /** Cannot say: a required fact is missing. */
  | 'needs-more-info'
  /** Cannot say: the rules rely on numbers no human has verified. */
  | 'unverified'
  /** Cannot say: the rules themselves are still a draft. */
  | 'draft';

export interface Outcome {
  benefitId: string;
  benefitName: string;
  status: OutcomeStatus;
  /** Monthly entitlement in EUR. Only meaningful when status is 'eligible'. */
  amountMonthly?: number;
  /** Facts still needed, when status is 'needs-more-info'. */
  missingFacts?: string[];
  /** Parameters used that no human has verified, when status is 'unverified'. */
  unverifiedParameters?: string[];
  trace: TraceStep[];
  /** How and where to claim it. */
  office: OfficeKind;
  /** Reference to the governing act. */
  law: string;
}

/**
 * A prompt shown "below the line": something this household might be entitled
 * to, that the engine cannot decide from the facts it has.
 *
 * This is on purpose a different kind of output from an Outcome. A lead never
 * states an entitlement and never shows an amount — it points at a question
 * worth asking. Blurring the two would turn "worth checking" into "you will
 * get this", which is exactly the failure that gets people's hopes up and
 * wastes a trip to the office.
 */
export interface Lead {
  id: string;
  /** What to tell the person, in their own terms. */
  prompt: string;
  /** Why this was surfaced, so it never looks arbitrary. */
  because: string;
  office: OfficeKind;
  /** Where to read more. */
  moreInfoUrl?: string;
}

export interface ScreeningResult {
  period: Period;
  /** Benefits the engine could decide, entitlements first. */
  outcomes: Outcome[];
  /** Things worth checking that the engine could not decide. */
  leads: Lead[];
  /** Sum of monthly amounts where status is 'eligible'. */
  totalMonthly: number;
  /** True when any outcome was withheld for want of verified parameters. */
  hasUnverified: boolean;
}

export type EngineMode = 'development' | 'production';

export interface EvaluationContext {
  situation: Situation;
  mode: EngineMode;
  /** Resolve a dated parameter, recording its verification state. */
  param(path: string): number;
  /** Record a reasoning step. */
  trace(step: TraceStep): void;
  /** Declare that a needed fact is absent. */
  missing(fact: string): void;
  /** Convenience accessors. */
  applicant(): Person | undefined;
  children(): Person[];
  householdIncomeMonthly(): number;
}

/**
 * How far a benefit's logic has got.
 *
 * Verifying the numbers is not the same as finishing the rules. A benefit can
 * use perfectly checked amounts and still model only half of its conditions,
 * which would produce a confident "you qualify" that the office then refuses.
 * A draft benefit therefore never answers in production either.
 */
export type BenefitMaturity = 'draft' | 'reviewed';

export interface Benefit {
  id: string;
  /** 'reviewed' only once a domain expert has signed off the full logic. */
  maturity: BenefitMaturity;
  /** Who reviewed the logic and when. */
  reviewedBy?: string;
  reviewedOn?: string;
  /** Human name, as the authority calls it. */
  name: string;
  /** Governing act. */
  law: string;
  office: OfficeKind;
  /**
   * Facts this benefit needs before it can be assessed. Drives the intake
   * order: ask what discriminates, not everything.
   */
  requiredFacts: string[];
  evaluate(ctx: EvaluationContext): { eligible: boolean; amountMonthly?: number };
}
