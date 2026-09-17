import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PlaywrightNotFoundError,
  buildRunArgs,
  escapeRegex,
  grepWasDropped,
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

describe('building the arguments for a selection', () => {
  const test = (file: string, ...titlePath: string[]) => ({
    testId: [file, ...titlePath].join(' > '),
    file,
    titlePath,
  });

  const args = (tests: ReturnType<typeof test>[]): string[] =>
    buildRunArgs({ cwd: '/repo', repoRoot: '/repo', tests });

  it('passes each file once, however many of its tests were selected', () => {
    const built = args([
      test('tests/a.spec.ts', 'one'),
      test('tests/a.spec.ts', 'two'),
      test('tests/b.spec.ts', 'three'),
    ]);
    expect(built.filter((arg) => arg.endsWith('.spec.ts'))).toEqual([
      'tests/a.spec.ts',
      'tests/b.spec.ts',
    ]);
  });

  it('anchors each title so a short one does not drag in a longer one', () => {
    // Without the anchor, selecting "logs in" would also run "logs in with a saved password".
    const built = args([test('a.spec.ts', 'logs in')]);
    const pattern = built[built.indexOf('--grep') + 1] as string;
    expect(new RegExp(pattern).test('chromium a.spec.ts logs in')).toBe(true);
    expect(new RegExp(pattern).test('chromium a.spec.ts logs in with a saved password')).toBe(
      false,
    );
  });

  it('matches a test nested in describe blocks', () => {
    const built = args([test('a.spec.ts', 'auth', 'logs in')]);
    const pattern = built[built.indexOf('--grep') + 1] as string;
    expect(new RegExp(pattern).test('chromium a.spec.ts auth logs in')).toBe(true);
  });

  it('escapes a title that would otherwise be a pattern', () => {
    const built = args([test('a.spec.ts', 'costs $5 (roughly)')]);
    const pattern = built[built.indexOf('--grep') + 1] as string;
    expect(new RegExp(pattern).test('chromium a.spec.ts costs $5 (roughly)')).toBe(true);
  });

  it('falls back to whole files when the title filter would be too long', () => {
    // Windows caps a command line near 32,000 characters. Failing with an unreadable spawn
    // error would be worse than running a few more tests than asked for.
    const many = Array.from({ length: 500 }, (_, index) =>
      test('a.spec.ts', `a fairly long test title number ${index}`),
    );
    expect(args(many)).not.toContain('--grep');
    expect(grepWasDropped(many)).toBe(true);
    expect(grepWasDropped([test('a.spec.ts', 'one')])).toBe(false);
  });

  it('writes file paths relative to where Playwright will run', () => {
    const built = buildRunArgs({
      cwd: '/repo/packages/web',
      repoRoot: '/repo',
      tests: [test('packages/web/tests/a.spec.ts', 'one')],
    });
    expect(built).toContain('tests/a.spec.ts');
  });
});
