import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullConfig, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import HunchReporter from '../src/reporter/index.js';
import { readRecords } from '../src/storage/jsonl.js';

/**
 * The reporter is the code that runs on every test of every run, in somebody else's suite.
 * These tests drive it with the shapes Playwright hands it, against a real git repository,
 * because the two things worth proving are that it records the right thing and that it cannot
 * take a suite down with it.
 */
describe('HunchReporter', () => {
  let repo: string;
  let stderr: MockInstance<typeof process.stderr.write>;
  let stdout: MockInstance<typeof process.stdout.write>;

  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'hunch-reporter-'));
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Hunch Test');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(repo, 'src.ts'), 'one\n');
    git('add', '.');
    git('commit', '-m', 'first');

    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderr.mockRestore();
    stdout.mockRestore();
    rmSync(repo, { recursive: true, force: true });
  });

  /** Playwright nests a test under a root suite, a project suite and a file suite. */
  const fakeTest = (options: {
    file: string;
    title: string;
    describes?: string[];
    project?: string;
  }): TestCase => {
    const project = { name: options.project ?? 'chromium' };
    let parent: unknown = {
      title: options.project ?? 'chromium',
      type: 'project',
      parent: undefined,
      project: () => project,
    };
    parent = { title: options.file, type: 'file', parent, project: () => project };
    for (const title of options.describes ?? []) {
      parent = { title, type: 'describe', parent, project: () => project };
    }

    return {
      title: options.title,
      location: { file: join(repo, options.file), line: 1, column: 1 },
      parent,
    } as unknown as TestCase;
  };

  const fakeResult = (status: string, duration = 100, retry = 0): TestResult =>
    ({ status, duration, retry }) as unknown as TestResult;

  const config = (): FullConfig => ({ rootDir: repo }) as unknown as FullConfig;

  const history = (): ReturnType<typeof readRecords> =>
    readRecords(join(repo, '.hunch', 'history.jsonl'));

  it('records a finished test', () => {
    const reporter = new HunchReporter();
    reporter.onBegin?.(config(), {} as Suite);
    reporter.onTestEnd?.(
      fakeTest({ file: 'tests/a.spec.ts', title: 'works', describes: ['maths'] }),
      fakeResult('passed', 250),
    );
    reporter.onEnd?.();

    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({
      testId: 'tests/a.spec.ts > maths > works',
      file: 'tests/a.spec.ts',
      project: 'chromium',
      status: 'passed',
      duration: 250,
      branch: 'main',
    });
  });

  it('stamps every test of a run with the same run id', () => {
    const reporter = new HunchReporter();
    reporter.onBegin?.(config(), {} as Suite);
    reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult('passed'));
    reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'two' }), fakeResult('failed'));
    reporter.onEnd?.();

    const ids = new Set(history().map((record) => record.runId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
  });

  it('gives two runs different run ids', () => {
    for (const status of ['passed', 'failed']) {
      const reporter = new HunchReporter();
      reporter.onBegin?.(config(), {} as Suite);
      reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult(status));
      reporter.onEnd?.();
    }
    expect(new Set(history().map((record) => record.runId)).size).toBe(2);
  });

  it('writes nothing until the run ends', () => {
    const reporter = new HunchReporter();
    reporter.onBegin?.(config(), {} as Suite);
    reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult('passed'));

    expect(history()).toEqual([]);
  });

  it('appends across runs rather than replacing', () => {
    for (let i = 0; i < 3; i += 1) {
      const reporter = new HunchReporter();
      reporter.onBegin?.(config(), {} as Suite);
      reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult('passed'));
      reporter.onEnd?.();
    }
    expect(history()).toHaveLength(3);
  });

  it('records the files the commit changed', () => {
    writeFileSync(join(repo, 'src.ts'), 'two\n');
    git('add', '.');
    git('commit', '-m', 'second');

    const reporter = new HunchReporter();
    reporter.onBegin?.(config(), {} as Suite);
    reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult('passed'));
    reporter.onEnd?.();

    expect(history()[0]?.changedFiles).toEqual(['src.ts']);
  });

  it('honours a custom output directory', () => {
    const reporter = new HunchReporter({ outputDir: '.testdata' });
    reporter.onBegin?.(config(), {} as Suite);
    reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult('passed'));
    reporter.onEnd?.();

    expect(readRecords(join(repo, '.testdata', 'history.jsonl'))).toHaveLength(1);
  });

  it('stays silent unless asked to speak', () => {
    const reporter = new HunchReporter();
    reporter.onBegin?.(config(), {} as Suite);
    reporter.onEnd?.();

    expect(stdout).not.toHaveBeenCalled();
    expect(reporter.printsToStdio?.()).toBe(false);
  });

  it('explains itself when asked to', () => {
    const reporter = new HunchReporter({ verbose: true });
    reporter.onBegin?.(config(), {} as Suite);
    reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult('passed'));
    reporter.onEnd?.();

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('[hunch]'));
    expect(reporter.printsToStdio?.()).toBe(true);
  });

  it('warns and collects nothing outside a git repository', () => {
    // A reporter must never be the reason a suite fails, so this is a warning and not a throw.
    const plain = mkdtempSync(join(tmpdir(), 'hunch-plain-'));
    try {
      const reporter = new HunchReporter();
      expect(() => {
        reporter.onBegin?.({ rootDir: plain } as unknown as FullConfig, {} as Suite);
        reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult('passed'));
        reporter.onEnd?.();
      }).not.toThrow();
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('not a git repository'));
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('survives a test object it cannot read', () => {
    const reporter = new HunchReporter();
    reporter.onBegin?.(config(), {} as Suite);
    expect(() => {
      reporter.onTestEnd?.({} as unknown as TestCase, fakeResult('passed'));
    }).not.toThrow();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('[hunch]'));
  });

  it('does nothing on a run it never began', () => {
    const reporter = new HunchReporter();
    expect(() => {
      reporter.onTestEnd?.(fakeTest({ file: 'a.spec.ts', title: 'one' }), fakeResult('passed'));
      reporter.onEnd?.();
    }).not.toThrow();
  });
});
