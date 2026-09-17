import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // One retry, so the history shows what a retried test looks like.
  retries: 1,
  // A named project, so the recorded history says which one each result came from.
  projects: [{ name: 'node' }],
  // `list` keeps the normal output. Hunch collects alongside it, and says what it is doing
  // only because `verbose` is on here; by default it stays silent.
  reporter: [['list'], ['@fluxomize/hunch/reporter', { verbose: true }]],
});
