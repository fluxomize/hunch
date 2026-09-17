import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // `list` keeps the normal output, and Hunch collects history alongside it without printing.
  reporter: [['list'], ['@fluxomize/hunch/reporter', { verbose: true }]],
});
