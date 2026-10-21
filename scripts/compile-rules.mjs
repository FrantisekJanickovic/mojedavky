#!/usr/bin/env node
/**
 * Validates the rule YAML and compiles it to JSON the engine imports.
 *
 *   node scripts/compile-rules.mjs            write the generated JSON
 *   node scripts/compile-rules.mjs --check    verify it is up to date, write nothing
 *
 * Why a compile step rather than reading YAML at runtime: a YAML parser is
 * ~30 kB in the browser, which is most of the bundle budget, and it would move
 * every error in the file from build time to somebody's phone.
 *
 * The validation is strict on purpose, and the rule that earns its keep is
 * rejecting keys it does not recognise. A silently ignored `verifed: true` or
 * `valeus:` would not fail anything — it would just quietly leave a number
 * unverified or a parameter empty, and the first sign of it would be a wrong
 * answer given to somebody about their rent. Every error is reported with the
 * parameter it is in, and all of them at once, because the person fixing this
 * file is checking law, not running a compiler in a loop.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';

const JURISDICTIONS = ['sk'];
const UNITS = ['eur', 'years', 'count', 'percent'];

const TOP_LEVEL_KEYS = ['jurisdiction', 'version', 'sources', 'parameters'];
const SOURCE_KEYS = ['title', 'url'];
const PARAM_KEYS = [
  'path',
  'description',
  'unit',
  'source',
  'verified',
  'verified_by',
  'verified_on',
  'placeholder',
  'values',
];
const VALUE_KEYS = ['from', 'value'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PATH = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;
const VERSION = /^\d{4}\.\d{1,2}\.\d+$/;

class Problems {
  constructor(file) {
    this.file = file;
    this.list = [];
    this.warnings = [];
  }

  at(where, message) {
    this.list.push(`${where}: ${message}`);
  }

  /** Worth saying, not worth failing over. */
  warn(where, message) {
    this.warnings.push(`${where}: ${message}`);
  }

  get count() {
    return this.list.length;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reject anything not in `allowed`, so a typo is an error and not a no-op. */
function rejectUnknownKeys(object, allowed, where, problems) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      problems.at(where, `unknown key "${key}" (expected one of: ${allowed.join(', ')})`);
    }
  }
}

/**
 * YAML parses an unquoted 2026-01-01 as a Date, so a file that quotes its dates
 * and one that does not would compile to different JSON. Normalise both to the
 * plain string the engine compares against.
 */
function asDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function validateSources(sources, problems) {
  if (!isPlainObject(sources)) {
    problems.at('sources', 'must be a mapping of key to { title, url }');
    return {};
  }

  for (const [key, source] of Object.entries(sources)) {
    const where = `sources.${key}`;
    if (!isPlainObject(source)) {
      problems.at(where, 'must be a mapping with title and url');
      continue;
    }
    rejectUnknownKeys(source, SOURCE_KEYS, where, problems);
    if (typeof source.title !== 'string' || source.title.trim() === '') {
      problems.at(where, 'title is required');
    }
    if (typeof source.url !== 'string' || !source.url.startsWith('https://')) {
      problems.at(where, 'url is required and must be https');
    }
  }

  return sources;
}

function validateValues(values, where, problems) {
  if (!Array.isArray(values) || values.length === 0) {
    problems.at(where, 'values must be a non-empty list');
    return [];
  }

  const seen = new Set();
  const out = [];

  values.forEach((entry, index) => {
    const at = `${where}.values[${index}]`;
    if (!isPlainObject(entry)) {
      problems.at(at, 'must be a mapping with from and value');
      return;
    }
    rejectUnknownKeys(entry, VALUE_KEYS, at, problems);

    const from = asDate(entry.from);
    if (typeof from !== 'string' || !DATE.test(from)) {
      problems.at(at, `from must be a date as YYYY-MM-DD, got ${JSON.stringify(entry.from)}`);
      return;
    }
    if (seen.has(from)) {
      problems.at(at, `two values both commence on ${from}`);
      return;
    }
    seen.add(from);

    if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) {
      problems.at(at, `value must be a finite number, got ${JSON.stringify(entry.value)}`);
      return;
    }

    out.push({ from, value: entry.value });
  });

  // Sorted on output so a new value inserted anywhere produces a diff that
  // reads in commencement order.
  out.sort((a, b) => a.from.localeCompare(b.from));
  return out;
}

function validateParameter(raw, index, sources, seenPaths, problems) {
  const where = isPlainObject(raw) && typeof raw.path === 'string' ? raw.path : `parameters[${index}]`;

  if (!isPlainObject(raw)) {
    problems.at(where, 'must be a mapping');
    return undefined;
  }
  rejectUnknownKeys(raw, PARAM_KEYS, where, problems);

  if (typeof raw.path !== 'string' || !PATH.test(raw.path)) {
    problems.at(where, 'path is required and must be lower-case dotted-kebab, e.g. pridavok.zakladna-suma');
    return undefined;
  }
  if (seenPaths.has(raw.path)) {
    problems.at(where, 'duplicate path');
    return undefined;
  }
  seenPaths.add(raw.path);

  if (typeof raw.description !== 'string' || raw.description.trim() === '') {
    problems.at(where, 'description is required');
  }
  if (!UNITS.includes(raw.unit)) {
    problems.at(where, `unit is required and must be one of: ${UNITS.join(', ')}`);
  }

  const source = sources[raw.source];
  if (!source) {
    problems.at(where, `source "${raw.source}" is not defined under sources`);
  }

  if (typeof raw.verified !== 'boolean') {
    problems.at(where, 'verified is required and must be true or false');
  }

  // The audit trail is only worth having if it cannot be half-filled.
  if (raw.verified === true) {
    if (typeof raw.verified_by !== 'string' || raw.verified_by.trim() === '') {
      problems.at(where, 'verified is true, so verified_by is required');
    }
    const on = asDate(raw.verified_on);
    if (typeof on !== 'string' || !DATE.test(on)) {
      problems.at(where, 'verified is true, so verified_on is required as YYYY-MM-DD');
    }
  } else {
    if (raw.verified_by !== undefined || raw.verified_on !== undefined) {
      problems.at(where, 'verified is false, so verified_by and verified_on must be absent');
    }
  }

  if (raw.placeholder !== undefined && typeof raw.placeholder !== 'boolean') {
    problems.at(where, 'placeholder must be true or false');
  }
  // A placeholder is a number nobody has supplied yet. Calling it verified
  // would be the one mistake this whole scheme exists to prevent.
  if (raw.placeholder === true && raw.verified === true) {
    problems.at(where, 'a placeholder cannot be verified');
  }

  const values = validateValues(raw.values, where, problems);

  const out = {
    path: raw.path,
    description: String(raw.description ?? '').trim(),
    unit: raw.unit,
    sourceKey: raw.source,
    source: source?.url ?? '',
    verified: raw.verified === true,
    values,
  };
  if (raw.placeholder === true) out.placeholder = true;
  if (raw.verified === true) {
    out.verifiedBy = raw.verified_by;
    out.verifiedOn = asDate(raw.verified_on);
  }
  return out;
}

/**
 * Validate one parsed document. Pure: reads nothing, writes nothing, never
 * exits — so the test suite can feed it deliberately broken documents and
 * assert on what it says. A validator nobody tests is a false sense of
 * security, and this one is the only thing standing between a typo in a decree
 * transcription and somebody's rent.
 *
 * Returns the compiled pack, or `undefined` for `json` when it found errors.
 */
export function validateDocument(doc, jurisdiction, file = `rules/${jurisdiction}/parameters.yaml`) {
  const problems = new Problems(file);

  if (!isPlainObject(doc)) {
    problems.at(file, 'the document must be a mapping');
    return { json: undefined, errors: problems.list, warnings: problems.warnings };
  }

  rejectUnknownKeys(doc, TOP_LEVEL_KEYS, '(top level)', problems);

  if (doc.jurisdiction !== jurisdiction) {
    problems.at('jurisdiction', `must be "${jurisdiction}", got ${JSON.stringify(doc.jurisdiction)}`);
  }
  if (typeof doc.version !== 'string' || !VERSION.test(doc.version)) {
    problems.at('version', 'must be a quoted string like "2026.10.1"');
  }

  const sources = validateSources(doc.sources, problems);

  if (!Array.isArray(doc.parameters) || doc.parameters.length === 0) {
    problems.at('parameters', 'must be a non-empty list');
    return { json: undefined, errors: problems.list, warnings: problems.warnings };
  }

  const seenPaths = new Set();
  const parameters = doc.parameters
    .map((raw, i) => validateParameter(raw, i, sources, seenPaths, problems))
    .filter((p) => p !== undefined);

  // A warning, not an error. A source can legitimately be cited only from a
  // benefit's trace in TypeScript, which this file cannot see — and a
  // validator that fails on a correct file is one people learn to route
  // around, which costs more than the dead entry it catches.
  const unused = Object.keys(sources).filter((k) => !parameters.some((p) => p.sourceKey === k));
  for (const key of unused) {
    problems.warn(`sources.${key}`, 'defined but no parameter cites it — dead entry, or cited only from rule code?');
  }

  if (problems.count > 0) {
    return { json: undefined, errors: problems.list, warnings: problems.warnings };
  }

  return {
    json: {
      jurisdiction,
      version: doc.version,
      generatedFrom: file,
      sources,
      parameters,
    },
    errors: [],
    warnings: problems.warnings,
  };
}

/** Byte-for-byte what belongs on disk, so --check can compare without parsing. */
export function serialise(json) {
  return `${JSON.stringify(json, null, 2)}\n`;
}

export function generatedPathFor(jurisdiction) {
  return `src/rules/${jurisdiction}/generated/parameters.json`;
}

export async function compileJurisdiction(jurisdiction) {
  const file = `rules/${jurisdiction}/parameters.yaml`;
  const doc = load(await readFile(file, 'utf8'));
  return { file, out: generatedPathFor(jurisdiction), ...validateDocument(doc, jurisdiction, file) };
}

async function main() {
  const check = process.argv.includes('--check');
  let failures = 0;

  for (const jurisdiction of JURISDICTIONS) {
    const { file, out, json, errors, warnings } = await compileJurisdiction(jurisdiction);

    if (!json) {
      console.error(`\n${errors.length} problem(s) in ${file}:\n`);
      for (const error of errors) console.error(`  - ${error}`);
      console.error('');
      failures++;
      continue;
    }

    for (const warning of warnings) console.warn(`WARN  ${file} — ${warning}`);

    const text = serialise(json);

    if (check) {
      const current = existsSync(out) ? await readFile(out, 'utf8') : '';
      if (current !== text) {
        console.error(`${out} is out of date with ${file}. Run: npm run rules`);
        failures++;
        continue;
      }
      console.log(`ok    ${file} → ${out} is up to date`);
    } else {
      await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true });
      await writeFile(out, text);
      console.log(`ok    ${file} → ${out}`);
    }

    const verified = json.parameters.filter((p) => p.verified).length;
    const placeholders = json.parameters.filter((p) => p.placeholder).length;
    console.log(
      `      pack ${json.version}: ${json.parameters.length} parameters, ` +
        `${verified} verified, ${placeholders} placeholder(s)`,
    );
  }

  if (failures > 0) process.exit(1);
}

// Only when run as a command, so importing it for tests has no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
