/**
 * HTTP handler: POST a household, get a screening back.
 *
 * NOT DEPLOYED. The site is static and the browser runs the engine itself, so
 * nothing here is reachable in production today — and that is the point: an
 * ordinary visitor's income and health facts never leave their device, because
 * there is no endpoint for them to be sent to.
 *
 * It is kept because the batch screening that municipalities would pay for does
 * need a server, and this is its seed: a framework-agnostic handler over the
 * standard Request/Response pair, so it will drop into whatever runtime that
 * product ends up on. Its tests also pin a contract worth keeping — that the
 * server path runs in production mode and therefore refuses to state an
 * entitlement from unverified rules.
 *
 * It persists nothing: no database, no session, no request-body logging.
 */

import { screenSk } from '../index.js';
import type { Situation } from '../engine/types.js';

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Reject anything that is not a plausible situation before touching the rules. */
function parseSituation(input: unknown): Situation | string {
  if (typeof input !== 'object' || input === null) return 'Body must be a JSON object.';
  const body = input as Record<string, unknown>;

  if (typeof body.period !== 'string' || !/^\d{4}-\d{2}$/.test(body.period)) {
    return 'Field "period" must be a YYYY-MM string.';
  }
  if (!Array.isArray(body.persons) || body.persons.length === 0) {
    return 'Field "persons" must be a non-empty array.';
  }
  if (body.persons.length > 20) {
    return 'A household of more than 20 people is not supported.';
  }
  if (typeof body.household !== 'object' || body.household === null) {
    return 'Field "household" must be an object.';
  }
  return body as unknown as Situation;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Body is not valid JSON.');
  }

  const parsed = parseSituation(body);
  if (typeof parsed === 'string') return badRequest(parsed);

  // Production mode on purpose: the deployed API must apply the verification
  // and maturity gates. Development mode is for the test suite, not for a URL.
  const report = screenSk(parsed, { mode: 'production' });

  return new Response(JSON.stringify(report), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
