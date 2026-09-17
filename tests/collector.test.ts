import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Collector, buildTestId, toRecord } from '../src/reporter/collector.js';
import type { FinishedTest, RunContext } from '../src/reporter/collector.js';
import { readRecords } from '../src/storage/jsonl.js';

const context: RunContext = {
  commitSha: 'c'.repeat(40),
  branch: 'main',
  changedFiles: ['src/login.ts'],
};

const finished = (overrides: Partial<FinishedTest> = {}): FinishedTest => ({
  file: 'tests/login.spec.ts',
  describes: ['login'],
  title: 'signs in',
  project: 'chromium',
  duration: 1200,
  status: 'passed',
  retry: 0,
  ...overrides,
});

const NOW = new Date('2026-09-17T12:00:00.000Z');

describe('buildTestId', () => {
  it('joins the file with the full title path', () => {
    expect(buildTestId('tests/login.spec.ts', ['login'], 'signs in')).toBe(
      'tests/login.spec.ts > login > signs in',
    );
  });

  it('handles a test with no describe block', () => {
    expect(buildTestId('tests/smoke.spec.ts', [], 'loads')).toBe('tests/smoke.spec.ts > loads');
  });

  it('keeps nested describes in order', () => {
    expect(buildTestId('a.spec.ts', ['outer', 'inner'], 't')).toBe('a.spec.ts > outer > inner > t');
  });

  it('produces the same id on Windows as on Linux', () => {
    // History written on a developer's Windows machine has to match history written by a
    // Linux runner, or the same test looks like two tests to the model.
    expect(buildTestId('tests\\login.spec.ts', [], 'signs in')).toBe(
      buildTestId('tests/login.spec.ts', [], 'signs in'),
    );
  });
});

describe('toRecord', () => {
  it('records everything the model needs about a test', () => {
    expect(toRecord(finished(), context, NOW)).toEqual({
      testId: 'tests/login.spec.ts > login > signs in',
      file: 'tests/login.spec.ts',
      project: 'chromium',
      duration: 1200,
      status: 'passed',
      timestamp: '2026-09-17T12:00:00.000Z',
      commitSha: 'c'.repeat(40),
      changedFiles: ['src/login.ts'],
      branch: 'main',
      retry: 0,
    });
  });

  it.each(['passed', 'failed', 'skipped', 'timedOut'] as const)('stores %s', (status) => {
    expect(toRecord(finished({ status }), context, NOW)?.status).toBe(status);
  });

  it('refuses to record an interrupted attempt', () => {
    // An interrupted test says the run was cut short, not that the test decided anything.
    // Storing it as a failure would teach the model that a cancelled CI job means breakage.
    expect(toRecord(finished({ status: 'interrupted' }), context, NOW)).toBeNull();
  });

  it('refuses to record a status it does not understand', () => {
    expect(toRecord(finished({ status: 'something-new' }), context, NOW)).toBeNull();
  });

  it('normalises Windows paths in the file field', () => {
    expect(toRecord(finished({ file: 'tests\\login.spec.ts' }), context, NOW)?.file).toBe(
      'tests/login.spec.ts',
    );
  });

  it('keeps the retry number so flaky tests are visible in the history', () => {
    expect(toRecord(finished({ retry: 2 }), context, NOW)?.retry).toBe(2);
  });
});

describe('Collector', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hunch-collector-'));
    file = join(dir, '.hunch', 'history.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('buffers rather than writing as it goes', () => {
    const collector = new Collector(file, context);
    collector.add(finished());
    collector.add(finished({ title: 'signs out' }));

    expect(collector.size).toBe(2);
    expect(readRecords(file)).toEqual([]);
  });

  it('writes the whole run in one flush', () => {
    const collector = new Collector(file, context);
    collector.add(finished());
    collector.add(finished({ title: 'signs out' }));

    expect(collector.flush()).toBe(2);
    expect(readRecords(file).map((r) => r.testId)).toEqual([
      'tests/login.spec.ts > login > signs in',
      'tests/login.spec.ts > login > signs out',
    ]);
  });

  it('empties the buffer once flushed, so a second flush writes nothing', () => {
    const collector = new Collector(file, context);
    collector.add(finished());
    collector.flush();

    expect(collector.flush()).toBe(0);
    expect(readRecords(file)).toHaveLength(1);
  });

  it('does not buffer attempts it would refuse to record', () => {
    const collector = new Collector(file, context);
    collector.add(finished({ status: 'interrupted' }));
    expect(collector.size).toBe(0);
  });

  it('records both attempts of a flaky test', () => {
    const collector = new Collector(file, context);
    collector.add(finished({ status: 'failed', retry: 0 }));
    collector.add(finished({ status: 'passed', retry: 1 }));
    collector.flush();

    expect(readRecords(file).map((r) => [r.status, r.retry])).toEqual([
      ['failed', 0],
      ['passed', 1],
    ]);
  });
});
