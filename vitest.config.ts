import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .mjs as well as .ts: the build scripts are plain JavaScript and sit
    // outside the TypeScript project, so their tests are written the same way.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'],
  },
});
