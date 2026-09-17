import { expect, test } from '@playwright/test';

test('a test that passes', async () => {
  expect(1 + 1).toBe(2);
});

test('another test that passes', async () => {
  expect('hunch').toHaveLength(5);
});
