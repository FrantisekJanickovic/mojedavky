#!/usr/bin/env node
/**
 * Builds the static site into dist/.
 *
 * The output is HTML plus one small JS bundle and nothing else: no framework
 * runtime, no font request, no analytics. The engine is bundled in, so the
 * screening runs on the visitor's device and no personal data is ever
 * transmitted — which is why this can be served from any static host and why
 * the hosting location does not matter.
 *
 * The size budget below is enforced, not advisory. Part of the audience opens
 * this on an old phone on metered data, and a bundle that quietly grows into
 * hundreds of kilobytes is a real barrier to them.
 */

import { build } from 'esbuild';
import { mkdir, copyFile, stat } from 'node:fs/promises';
import { generatedPathFor } from './compile-rules.mjs';

const BUDGET_KB = 40;

await mkdir('dist', { recursive: true });

const result = await build({
  entryPoints: ['src/web/main.ts'],
  outfile: 'dist/app.js',
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  metafile: true,
});

await copyFile('web/index.html', 'dist/index.html');

// The rule pack is bundled into app.js for speed, and published here as well
// so that anybody can read the numbers this site answered with, and check them
// against the decree, without reading the bundle. It is also the artifact a
// future runtime-loaded pack would be fetched from.
await mkdir('dist/rules', { recursive: true });
await copyFile(generatedPathFor('sk'), 'dist/rules/sk.json');

const { size } = await stat('dist/app.js');
const kb = size / 1024;

console.log(`dist/index.html  ${((await stat('dist/index.html')).size / 1024).toFixed(1)} kB`);
console.log(`dist/app.js      ${kb.toFixed(1)} kB (budget ${BUDGET_KB} kB)`);

if (result.warnings.length > 0) {
  for (const warning of result.warnings) console.warn(warning.text);
}

if (kb > BUDGET_KB) {
  console.error(
    `\nBundle is ${kb.toFixed(1)} kB, over the ${BUDGET_KB} kB budget.\n` +
      'Either trim it or raise the budget deliberately — do not let it drift.',
  );
  process.exit(1);
}
