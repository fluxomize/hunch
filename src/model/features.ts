import type { TestRecord } from '../types.js';

/**
 * Turning history into numbers the model can learn from.
 *
 * The question the model answers is: given this set of changed files, how likely is this test
 * to fail? Every feature here exists to answer some part of that, and every one of them is a
 * plain number a human can inspect in `model.json` and argue with. Nothing is embedded,
 * hashed, or otherwise made unreadable.
 *
 * The rule that governs this whole module is that a feature for a given run may only be
 * computed from runs that happened before it. Anything else is training on the answer.
 */

/**
 * Names of the features, in the order every vector uses.
 *
 * This order is stored in `model.json` alongside the weights, so a model trained by one
 * version of Hunch cannot be silently misread by another.
 */
export const FEATURE_NAMES = [
  'bias',
  'failureRate',
  'observationConfidence',
  'recentFailureRate',
  'failureRecency',
  'flakyRate',
  'durationWeight',
  'coChangeFailureRate',
  'coChangeSupport',
  'ownFileChanged',
  'pathAffinity',
  'changesetSize',
] as const;

/** How many past appearances count as knowing a test well. */
const CONFIDENCE_HORIZON = 20;

/** How many recent appearances the recent failure rate looks at. */
const RECENT_WINDOW = 10;

/** A duration, in milliseconds, that counts as a slow test. Used to bound the duration feature. */
const SLOW_TEST_MS = 30_000;

/** A changeset size that counts as large. Used to bound the changeset feature. */
const LARGE_CHANGESET = 50;

/** What one test did in one run, after its attempts have been folded together. */
export interface TestOutcome {
  testId: string;
  file: string;
  /** True when any attempt in the run failed or timed out. */
  failed: boolean;
  /** True when the run contains both a failing and a passing attempt of this test. */
  flaky: boolean;
  /** Longest attempt duration, in milliseconds. */
  duration: number;
}

/** One complete run, as training walks over it. */
export interface Run {
  runId: string;
  /** Earliest timestamp seen in the run, used only for ordering. */
  timestamp: string;
  changedFiles: string[];
  outcomes: TestOutcome[];
}

/** Running totals for one test, accumulated as history is replayed in order. */
interface TestStats {
  appearances: number;
  failures: number;
  flakyRuns: number;
  totalDuration: number;
  /** Most recent outcomes, newest last, capped at RECENT_WINDOW. */
  recent: boolean[];
  /** How many runs ago this test last failed, or null if it never has. */
  runsSinceFailure: number | null;
}

/** How often a test failed in runs where a given file changed. */
interface CoChangeStats {
  appearances: number;
  failures: number;
}

/**
 * Everything learned from the runs replayed so far.
 *
 * Kept as a mutable object that training advances one run at a time, because that is what
 * makes it impossible to accidentally use the future: the index simply does not contain it
 * yet when the features for a run are extracted.
 */
export interface HistoryIndex {
  tests: Map<string, TestStats>;
  /** Keyed by `testId` then by changed file path. */
  coChange: Map<string, Map<string, CoChangeStats>>;
  runsSeen: number;
}

/** An empty index, as at the beginning of history. */
export function createIndex(): HistoryIndex {
  return { tests: new Map(), coChange: new Map(), runsSeen: 0 };
}

/**
 * Groups raw records into runs, oldest first.
 *
 * Records are grouped by `runId` when it is present. Histories recorded before that field
 * existed fall back to the commit, which merges two runs of the same commit into one; that
 * loses a little detail but never invents any.
 */
export function groupIntoRuns(records: TestRecord[]): Run[] {
  const runs = new Map<string, Run>();
  const attempts = new Map<string, Map<string, TestRecord[]>>();

  for (const record of records) {
    const key = record.runId ?? record.commitSha;
    let run = runs.get(key);
    if (!run) {
      run = {
        runId: key,
        timestamp: record.timestamp,
        changedFiles: record.changedFiles,
        outcomes: [],
      };
      runs.set(key, run);
      attempts.set(key, new Map());
    }
    if (record.timestamp < run.timestamp) {
      run.timestamp = record.timestamp;
    }

    const byTest = attempts.get(key);
    /* c8 ignore next 3 */
    if (!byTest) {
      continue;
    }
    const existing = byTest.get(record.testId);
    if (existing) {
      existing.push(record);
    } else {
      byTest.set(record.testId, [record]);
    }
  }

  for (const [key, run] of runs) {
    const byTest = attempts.get(key);
    /* c8 ignore next 3 */
    if (!byTest) {
      continue;
    }
    for (const [testId, records_] of byTest) {
      const outcome = foldAttempts(testId, records_);
      if (outcome) {
        run.outcomes.push(outcome);
      }
    }
  }

  return [...runs.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Folds every attempt of one test in one run into a single outcome.
 *
 * A test that failed and then passed on retry counts as a failure, because it did fail and
 * running it was worth the time. It is also marked flaky, which is a separate feature, so the
 * model can learn to discount tests whose failures do not mean much.
 *
 * Tests that only ever got skipped are dropped: a skip is an absence of evidence.
 */
function foldAttempts(testId: string, records: TestRecord[]): TestOutcome | null {
  const ran = records.filter((record) => record.status !== 'skipped');
  if (ran.length === 0) {
    return null;
  }

  const failed = ran.some((record) => record.status === 'failed' || record.status === 'timedOut');
  const passed = ran.some((record) => record.status === 'passed');
  const first = ran[0] as TestRecord;

  return {
    testId,
    file: first.file,
    failed,
    flaky: failed && passed,
    duration: Math.max(...ran.map((record) => record.duration)),
  };
}

/**
 * Builds the feature vector for one test against one set of changed files.
 *
 * Every value is bounded roughly to [0, 1] on purpose. The regression underneath does plain
 * gradient descent with no feature scaling of its own, so features on wildly different scales
 * would make it diverge or let one feature dominate for no better reason than its units.
 */
export function extractFeatures(
  index: HistoryIndex,
  testId: string,
  file: string,
  changedFiles: string[],
): number[] {
  const stats = index.tests.get(testId);
  const coChange = index.coChange.get(testId);

  const appearances = stats?.appearances ?? 0;
  const failureRate = appearances > 0 ? (stats as TestStats).failures / appearances : 0;
  const confidence = Math.min(appearances, CONFIDENCE_HORIZON) / CONFIDENCE_HORIZON;

  const recent = stats?.recent ?? [];
  const recentFailureRate =
    recent.length > 0 ? recent.filter(Boolean).length / recent.length : failureRate;

  // Recency decays rather than cutting off, so "failed last run" and "failed thirty runs ago"
  // are different numbers instead of the same one.
  const runsSinceFailure = stats?.runsSinceFailure;
  const failureRecency =
    runsSinceFailure === null || runsSinceFailure === undefined ? 0 : 1 / (1 + runsSinceFailure);

  const flakyRate = appearances > 0 ? (stats as TestStats).flakyRuns / appearances : 0;

  const averageDuration = appearances > 0 ? (stats as TestStats).totalDuration / appearances : 0;
  const durationWeight = averageDuration / (averageDuration + SLOW_TEST_MS);

  // The feature the whole project is built around: when these files changed in the past, did
  // this test fail? This is what a dependency graph cannot tell you.
  let coChangeFailureRate = 0;
  let coChangeSupport = 0;
  if (coChange && changedFiles.length > 0) {
    let weighted = 0;
    let observed = 0;
    for (const changedFile of changedFiles) {
      const entry = coChange.get(changedFile);
      if (entry && entry.appearances > 0) {
        weighted += entry.failures / entry.appearances;
        observed += 1;
        coChangeSupport = Math.max(
          coChangeSupport,
          Math.min(entry.appearances, CONFIDENCE_HORIZON) / CONFIDENCE_HORIZON,
        );
      }
    }
    coChangeFailureRate = observed > 0 ? weighted / observed : 0;
  }

  const ownFileChanged = changedFiles.includes(file) ? 1 : 0;
  const pathAffinity = bestPathAffinity(file, changedFiles);
  const changesetSize = Math.min(changedFiles.length, LARGE_CHANGESET) / LARGE_CHANGESET;

  return [
    1, // bias; the regression underneath has no intercept of its own
    failureRate,
    confidence,
    recentFailureRate,
    failureRecency,
    flakyRate,
    durationWeight,
    coChangeFailureRate,
    coChangeSupport,
    ownFileChanged,
    pathAffinity,
    changesetSize,
  ];
}

/**
 * How close the test file sits to the closest changed file in the directory tree.
 *
 * A crude stand-in for "these things are probably related", and deliberately crude: it costs
 * nothing, needs no parsing, and works for any language. Sharing `src/auth/` scores high,
 * sharing only the repository root scores zero.
 */
export function bestPathAffinity(file: string, changedFiles: string[]): number {
  let best = 0;
  const testParts = dirParts(file);
  for (const changedFile of changedFiles) {
    const changedParts = dirParts(changedFile);
    const depth = Math.max(testParts.length, changedParts.length);
    if (depth === 0) {
      continue;
    }
    let shared = 0;
    while (
      shared < testParts.length &&
      shared < changedParts.length &&
      testParts[shared] === changedParts[shared]
    ) {
      shared += 1;
    }
    best = Math.max(best, shared / depth);
  }
  return best;
}

/** Directory segments of a path, without the file name itself. */
function dirParts(path: string): string[] {
  const parts = path.split('/');
  parts.pop();
  return parts.filter((part) => part.length > 0);
}

/** Folds one run into the index, so later runs can use it as history. */
export function advanceIndex(index: HistoryIndex, run: Run): void {
  index.runsSeen += 1;

  for (const outcome of run.outcomes) {
    let stats = index.tests.get(outcome.testId);
    if (!stats) {
      stats = {
        appearances: 0,
        failures: 0,
        flakyRuns: 0,
        totalDuration: 0,
        recent: [],
        runsSinceFailure: null,
      };
      index.tests.set(outcome.testId, stats);
    }

    stats.appearances += 1;
    stats.totalDuration += outcome.duration;
    if (outcome.failed) {
      stats.failures += 1;
      stats.runsSinceFailure = 0;
    } else if (stats.runsSinceFailure !== null) {
      stats.runsSinceFailure += 1;
    }
    if (outcome.flaky) {
      stats.flakyRuns += 1;
    }

    stats.recent.push(outcome.failed);
    if (stats.recent.length > RECENT_WINDOW) {
      stats.recent.shift();
    }

    let coChange = index.coChange.get(outcome.testId);
    if (!coChange) {
      coChange = new Map();
      index.coChange.set(outcome.testId, coChange);
    }
    for (const changedFile of run.changedFiles) {
      const entry = coChange.get(changedFile) ?? { appearances: 0, failures: 0 };
      entry.appearances += 1;
      if (outcome.failed) {
        entry.failures += 1;
      }
      coChange.set(changedFile, entry);
    }
  }
}

/** Feature vectors and their labels, ready to be handed to the regression. */
export interface TrainingSet {
  featureNames: string[];
  rows: number[][];
  /** 1 when the test failed in that run, 0 when it passed. */
  labels: number[];
  /** How many runs contributed examples. */
  runCount: number;
}

/**
 * Replays history in order, producing one training example per test per run.
 *
 * The first run produces no examples: with nothing before it, every feature would be zero and
 * the label would be pure noise. Everything after it is scored against an index holding only
 * the runs that genuinely came earlier.
 */
export function buildTrainingSet(records: TestRecord[]): TrainingSet {
  const runs = groupIntoRuns(records);
  const index = createIndex();
  const rows: number[][] = [];
  const labels: number[] = [];
  let runCount = 0;

  for (const run of runs) {
    if (index.runsSeen > 0 && run.outcomes.length > 0) {
      runCount += 1;
      for (const outcome of run.outcomes) {
        rows.push(extractFeatures(index, outcome.testId, outcome.file, run.changedFiles));
        labels.push(outcome.failed ? 1 : 0);
      }
    }
    advanceIndex(index, run);
  }

  return { featureNames: [...FEATURE_NAMES], rows, labels, runCount };
}

/** Builds the index over the whole history, for predicting rather than training. */
export function buildIndex(records: TestRecord[]): HistoryIndex {
  const index = createIndex();
  for (const run of groupIntoRuns(records)) {
    advanceIndex(index, run);
  }
  return index;
}
