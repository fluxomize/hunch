import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PlaywrightNotFoundError,
  escapeRegex,
  listTests,
  parseTestList,
  resolvePlaywrightCli,
} from '../src/runner/playwright.js';

/** A listing shaped like the one Playwright actually produces, checked against a real run. */
const listing = JSON.stringify({
  config: { rootDir: '/repo/examples/basic/tests' },
  suites: [
    {
      title: 'example.spec.ts',
      file: 'example.spec.ts',
      specs: [{ title: 'reads a string length' }],
      suites: [
        {
          title: 'arithmetic',
          file: 'example.spec.ts',
          specs: [{ title: 'adds numbers' }, { title: 'multiplies numbers' }],
        },
      ],
    },
    {
      title: 'failing.spec.ts',
      file: 'failing.spec.ts',
      specs: [],
      suites: [
        {
          title: 'a suite with a problem',
          file: 'failing.spec.ts',
          specs: [{ title: 'a test that fails' }],
        },
      ],
    },
  ],
});

describe('parsing the Playwright listing', () => {
  const tests = parseTestList(listing, '/repo');

  it('finds every test, at any nesting depth', () => {
    expect(tests).toHaveLength(4);
  });

  it('rebases paths from Playwright rootDir onto the repository root', () => {
    // Playwright reports paths relative to the resolved testDir; history is relative to the
    // top of the working tree. If these disagree, every test looks new to the model.
    expect(tests.every((test) => test.file.startsWith('examples/basic/tests/'))).toBe(true);
  });

  it('builds identifiers that match what the reporter records', () => {
    expect(tests.map((test) => test.testId)).toContain(
      'examples/basic/tests/example.spec.ts > arithmetic > adds numbers',
    );
  });

  it('handles a test with no describe block', () => {
    expect(tests.map((test) => test.testId)).toContain(
      'examples/basic/tests/example.spec.ts > reads a string length',
    );
  });

  it('keeps the title path that --grep will match against', () => {
    const test = tests.find((each) => each.titlePath.at(-1) === 'adds numbers');
    expect(test?.titlePath).toEqual(['arithmetic', 'adds numbers']);
  });

  it('copes with an empty suite', () => {
    expect(parseTestList(JSON.stringify({ config: {}, suites: [] }), '/repo')).toEqual([]);
  });

  it('copes with a payload missing the parts it expects', () => {
    expect(parseTestList('{}', '/repo')).toEqual([]);
  });
});

describe('escaping titles for --grep', () => {
  it('leaves an ordinary title alone', () => {
    expect(escapeRegex('adds numbers')).toBe('adds numbers');
  });

  it('escapes the characters that would otherwise be a pattern', () => {
    // A test called "costs $5 (roughly)" must not become a regex that matches nothing.
    expect(escapeRegex('costs $5 (roughly)')).toBe('costs \\$5 \\(roughly\\)');
  });

  it('escapes a backslash', () => {
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });

  it('produces a pattern that matches the original text', () => {
    const title = 'handles [weird] + (titles) * properly?';
    expect(new RegExp(escapeRegex(title)).test(title)).toBe(true);
  });
});

describe('finding the Playwright CLI', () => {
  it('resolves the copy this project depends on', () => {
    expect(resolvePlaywrightCli(process.cwd())).toMatch(/cli\.js$/);
  });

  it('says so clearly when the project has no Playwright', () => {
    const empty = mkdtempSync(join(tmpdir(), 'hunch-nopw-'));
    try {
      expect(() => resolvePlaywrightCli(empty)).toThrow(PlaywrightNotFoundError);
      expect(() => resolvePlaywrightCli(empty)).toThrow(/Could not find @playwright\/test/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('reports a listing failure instead of throwing something unreadable', () => {
    const empty = mkdtempSync(join(tmpdir(), 'hunch-nopw-'));
    try {
      expect(() => listTests({ cwd: empty, repoRoot: empty })).toThrow(PlaywrightNotFoundError);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
