import { expect, test } from '@playwright/test';

test.describe('arithmetic', () => {
  test('adds numbers', async () => {
    expect(1 + 1).toBe(2);
  });

  test('multiplies numbers', async () => {
    expect(6 * 7).toBe(42);
  });
});

test('reads a string length', async () => {
  expect('hunch').toHaveLength(5);
});

test.skip('a test that is skipped', async () => {
  expect(true).toBe(false);
});
