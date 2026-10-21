#!/usr/bin/env node
/**
 * Post-deploy check on the live static site.
 *
 * The unit tests prove the app behaves in a test DOM. This proves the right
 * files are actually being served at the right address — a different claim.
 * A build can be perfect while the DNS points at a parking page, the custom
 * domain setting was never saved, or an old deployment is still live.
 *
 * It is deliberately shallow: fetch the page, fetch the bundle, confirm they
 * are what we shipped. Driving a real browser here would catch more and take
 * ten times as long for a site this size.
 *
 * Usage: node scripts/smoke-site.mjs https://example.sk
 */

const base = process.argv[2];

if (!base) {
  console.error('Usage: node scripts/smoke-site.mjs <url>');
  process.exit(2);
}

let failures = 0;

function fail(message) {
  console.error(`FAIL  ${message}`);
  failures++;
}

function pass(message) {
  console.log(`ok    ${message}`);
}

async function get(path) {
  const url = new URL(path, base).toString();
  const response = await fetch(url, { redirect: 'follow' });
  return { url, response, body: await response.text() };
}

// --- the page itself -------------------------------------------------------

const page = await get('/');

if (!page.response.ok) {
  fail(`GET ${page.url} returned ${page.response.status}`);
  console.error('\nNothing else can be checked. Is the domain pointed at Pages?');
  process.exit(1);
}
pass(`the page is served from ${page.url}`);

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(base);

if (isLocal) {
  pass('HTTPS check skipped for a local address');
} else if (!page.response.url.startsWith('https://')) {
  fail(`the page resolved to ${page.response.url}, which is not HTTPS`);
} else {
  pass('served over HTTPS');
}

for (const [needle, what] of [
  ['Na čo máte nárok', 'the heading'],
  ['lang="sk"', 'the Slovak language attribute'],
  ['/app.js', 'the script tag'],
]) {
  if (page.body.includes(needle)) pass(`${what} is present`);
  else fail(`${what} is missing — this may be a stale or wrong deployment`);
}

// A parking page or registrar placeholder is the failure this is really for.
for (const marker of ['Domain for sale', 'parked', 'Nginx Welcome', 'Apache2 Default']) {
  if (page.body.toLowerCase().includes(marker.toLowerCase())) {
    fail(`the response looks like a placeholder page (matched "${marker}")`);
  }
}

// --- the bundle ------------------------------------------------------------

const bundle = await get('/app.js');

if (!bundle.response.ok) {
  fail(`GET ${bundle.url} returned ${bundle.response.status} — the page cannot work`);
} else {
  pass('the bundle is served');

  const kb = bundle.body.length / 1024;
  console.log(`      bundle is ${kb.toFixed(1)} kB`);

  // The engine has to be in there, or the page renders and does nothing.
  if (bundle.body.includes('upsvr.gov.sk')) pass('the rules are bundled in');
  else fail('the bundle does not contain the rules — wrong build?');

  // Production mode is what keeps the gates on. Catching a stray development
  // build here is the whole reason this check exists.
  if (/\bdevelopment\b/.test(bundle.body)) {
    fail('the bundle mentions development mode — the gates may be off');
  } else {
    pass('no development-mode marker in the bundle');
  }
}

// --- things that must NOT be there ----------------------------------------

if (/google-analytics|googletagmanager|hotjar|facebook\.net/i.test(page.body)) {
  fail('the page loads a third-party tracker, which this product must not do');
} else {
  pass('no third-party trackers');
}

console.log();
if (failures > 0) {
  console.error(`${failures} check(s) failed against ${base}.`);
  process.exit(1);
}
console.log(`Live site looks right at ${base}.`);
