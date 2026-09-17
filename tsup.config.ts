import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'reporter/index': 'src/reporter/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  // Both formats on purpose. Playwright resolves a reporter through CommonJS machinery, so an
  // ESM only package fails to resolve `@fluxomize/hunch/reporter` at all, which is the very
  // first thing a user configures. The CJS output exists to make that integration work.
  format: ['esm', 'cjs'],
  target: 'node20',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  // The CLI entry keeps its own shebang; tsup preserves it and marks the file executable.
});
