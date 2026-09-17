import { describe, expect, it } from 'vitest';
import {
  FEATURE_NAMES,
  advanceIndex,
  bestPathAffinity,
  buildIndex,
  buildTrainingSet,
  createIndex,
  extractFeatures,
  groupIntoRuns,
} from '../src/model/features.js';
import type { TestRecord } from '../src/types.js';
import { SYNTHETIC, syntheticHistory } from './support/synthetic.js';

const record = (overrides: Partial<TestRecord> = {}): TestRecord => ({
  testId: 'tests/a.spec.ts > works',
  file: 'tests/a.spec.ts',
  project: 'chromium',
  duration: 1000,
  status: 'passed',
  timestamp: '2026-01-01T00:00:00.000Z',
  commitSha: '0'.repeat(40),
  changedFiles: ['src/a.ts'],
  branch: 'main',
  runId: 'run-1',
  retry: 0,
  ...overrides,
});

describe('grouping records into runs', () => {
  it('groups by runId', () => {
    const runs = groupIntoRuns([
      record({ runId: 'a' }),
      record({ runId: 'a', testId: 'other' }),
      record({ runId: 'b' }),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.outcomes).toHaveLength(2);
  });

  it('keeps two runs of the same commit apart', () => {
    // This is the case commitSha alone cannot express, and it is exactly where flakiness lives.
    const runs = groupIntoRuns([
      record({ runId: 'a', commitSha: 'same', status: 'failed' }),
      record({ runId: 'b', commitSha: 'same', status: 'passed' }),
    ]);
    expect(runs).toHaveLength(2);
  });

  it('falls back to the commit for histories recorded before runId existed', () => {
    const older = record();
    delete older.runId;
    const other = record({ testId: 'other' });
    delete other.runId;
    expect(groupIntoRuns([older, other])).toHaveLength(1);
  });

  it('orders runs oldest first whatever order the file is in', () => {
    const runs = groupIntoRuns([
      record({ runId: 'late', timestamp: '2026-02-01T00:00:00.000Z' }),
      record({ runId: 'early', timestamp: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(runs.map((run) => run.runId)).toEqual(['early', 'late']);
  });

  it('counts a test that failed then passed on retry as a failure, and marks it flaky', () => {
    const runs = groupIntoRuns([
      record({ status: 'failed', retry: 0 }),
      record({ status: 'passed', retry: 1 }),
    ]);
    expect(runs[0]?.outcomes[0]).toMatchObject({ failed: true, flaky: true });
  });

  it('counts a timeout as a failure', () => {
    const runs = groupIntoRuns([record({ status: 'timedOut' })]);
    expect(runs[0]?.outcomes[0]?.failed).toBe(true);
  });

  it('drops a test that was only ever skipped', () => {
    // A skip is an absence of evidence, not evidence the test is fine.
    const runs = groupIntoRuns([record({ status: 'skipped' })]);
    expect(runs[0]?.outcomes).toHaveLength(0);
  });

  it('takes the longest attempt as the duration', () => {
    const runs = groupIntoRuns([
      record({ status: 'failed', duration: 100 }),
      record({ status: 'passed', duration: 900, retry: 1 }),
    ]);
    expect(runs[0]?.outcomes[0]?.duration).toBe(900);
  });
});

describe('path affinity', () => {
  it('is highest when the files share their whole directory', () => {
    expect(bestPathAffinity('src/auth/login.spec.ts', ['src/auth/login.ts'])).toBe(1);
  });

  it('is zero when the files share nothing but the repository root', () => {
    expect(bestPathAffinity('tests/a.spec.ts', ['src/b.ts'])).toBe(0);
  });

  it('is partial when the files share a prefix', () => {
    const score = bestPathAffinity('src/auth/deep/a.spec.ts', ['src/auth/b.ts']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('takes the closest changed file, not the average', () => {
    expect(bestPathAffinity('src/auth/a.spec.ts', ['docs/x.md', 'src/auth/b.ts'])).toBe(1);
  });

  it('is zero when nothing changed', () => {
    expect(bestPathAffinity('src/a.spec.ts', [])).toBe(0);
  });
});

describe('feature extraction', () => {
  it('produces one value per declared feature name', () => {
    const features = extractFeatures(createIndex(), 'x', 'tests/x.spec.ts', ['src/a.ts']);
    expect(features).toHaveLength(FEATURE_NAMES.length);
  });

  it('starts with the bias, which is always 1', () => {
    expect(FEATURE_NAMES[0]).toBe('bias');
    expect(extractFeatures(createIndex(), 'x', 'tests/x.spec.ts', [])[0]).toBe(1);
  });

  it('returns finite numbers for a test it has never seen', () => {
    const features = extractFeatures(createIndex(), 'unseen', 'tests/x.spec.ts', ['src/a.ts']);
    expect(features.every(Number.isFinite)).toBe(true);
  });

  it('raises the failure rate of a test that keeps failing', () => {
    const index = createIndex();
    const name = (n: string): number => FEATURE_NAMES.indexOf(n as (typeof FEATURE_NAMES)[number]);

    const before = extractFeatures(index, 'x', 'tests/x.spec.ts', ['src/a.ts']);
    for (let i = 0; i < 5; i += 1) {
      advanceIndex(index, {
        runId: `r${i}`,
        timestamp: '2026-01-01T00:00:00.000Z',
        changedFiles: ['src/a.ts'],
        outcomes: [
          { testId: 'x', file: 'tests/x.spec.ts', failed: true, flaky: false, duration: 100 },
        ],
      });
    }
    const after = extractFeatures(index, 'x', 'tests/x.spec.ts', ['src/a.ts']);

    expect(after[name('failureRate')]).toBeGreaterThan(before[name('failureRate')] as number);
    expect(after[name('coChangeFailureRate')]).toBeGreaterThan(0);
    expect(after[name('failureRecency')]).toBe(1);
  });

  it('marks the test whose own file changed', () => {
    const own = FEATURE_NAMES.indexOf('ownFileChanged');
    expect(extractFeatures(createIndex(), 'x', 'tests/x.spec.ts', ['tests/x.spec.ts'])[own]).toBe(
      1,
    );
    expect(extractFeatures(createIndex(), 'x', 'tests/x.spec.ts', ['src/a.ts'])[own]).toBe(0);
  });

  it('separates a test that breaks with a file from one that does not', () => {
    // The claim the whole project rests on: two tests touched by the same change, told apart
    // by what actually happened before.
    const index = buildIndex(syntheticHistory({ runs: 40 }));
    const rate = FEATURE_NAMES.indexOf('coChangeFailureRate');

    const guilty = extractFeatures(index, SYNTHETIC.authTest.testId, SYNTHETIC.authTest.file, [
      'src/auth.ts',
    ]);
    const innocent = extractFeatures(
      index,
      SYNTHETIC.innocentUiTest.testId,
      SYNTHETIC.innocentUiTest.file,
      ['src/auth.ts'],
    );

    expect(guilty[rate]).toBeGreaterThan(0.5);
    expect(innocent[rate]).toBe(0);
  });
});

describe('building a training set', () => {
  it('produces nothing from a single run', () => {
    // With no history behind it, every feature would be zero and the label would be noise.
    const set = buildTrainingSet(syntheticHistory({ runs: 1 }));
    expect(set.rows).toHaveLength(0);
    expect(set.runCount).toBe(0);
  });

  it('produces one example per test per run after the first', () => {
    const set = buildTrainingSet(syntheticHistory({ runs: 10 }));
    expect(set.runCount).toBe(9);
    expect(set.rows).toHaveLength(set.labels.length);
    expect(set.rows.length).toBeGreaterThan(0);
  });

  it('labels failures as 1 and passes as 0', () => {
    const set = buildTrainingSet(syntheticHistory({ runs: 30 }));
    expect(new Set(set.labels)).toEqual(new Set([0, 1]));
  });

  it('never lets a run see itself', () => {
    // The check that matters most in this file. The first example of the second run is scored
    // against exactly one run of history, so its confidence feature cannot exceed one run's
    // worth however many runs the history actually contains.
    const set = buildTrainingSet(syntheticHistory({ runs: 30 }));
    const confidence = FEATURE_NAMES.indexOf('observationConfidence');
    expect(set.rows[0]?.[confidence]).toBeCloseTo(1 / 20, 10);
  });

  it('carries the declared feature names', () => {
    expect(buildTrainingSet(syntheticHistory({ runs: 5 })).featureNames).toEqual([
      ...FEATURE_NAMES,
    ]);
  });

  it('returns an empty set for an empty history', () => {
    expect(buildTrainingSet([]).rows).toHaveLength(0);
  });
});
