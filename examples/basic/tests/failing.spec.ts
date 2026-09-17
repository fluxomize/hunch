import { expect, test } from '@playwright/test';

// Deliberately failing, so the example produces a history with more than one outcome in it.
// Delete this file if you only want the example to go green.
test.describe('a suite with a problem', () => {
  test('a test that fails', async () => {
    expect('hunch').toBe('hutch');
  });
});
