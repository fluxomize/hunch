import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Types and declarations emit no runtime code, so counting them only moves the number.
        'src/types.ts',
        '**/*.d.ts',
        // Re-export barrels and the bin shim, which contain no logic to get wrong.
        'src/index.ts',
        'src/cli/index.ts',
      ],
      // A floor rather than a target. It exists so that coverage cannot quietly fall, which is
      // what the contributing guide promises; raise it when the real number moves up.
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
