import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'reporter/index': 'src/reporter/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  // The CLI entry keeps its own shebang; tsup preserves it and marks the file executable.
});
