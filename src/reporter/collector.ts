import { appendRecords } from '../storage/jsonl.js';
import type { TestRecord, TestStatus } from '../types.js';

/**
 * Turns finished tests into history records.
 *
 * This module deliberately knows nothing about Playwright's classes. The reporter reduces a
 * `TestCase` and a `TestResult` to the plain shape below, which keeps every rule about what
 * we record, and what we refuse to record, testable without starting a browser.
 */

/** A finished test attempt, reduced to the facts Hunch stores. */
export interface FinishedTest {
  /** Test file path. May be absolute and may use backslashes; it is normalised on the way in. */
  file: string;
  /** Titles of the enclosing describe blocks, outermost first. */
  describes: string[];
  /** The test's own title. */
  title: string;
  /** Name of the Playwright project the test ran under. */
  project: string;
  /** Duration of this attempt, in milliseconds. */
  duration: number;
  /** Playwright's own status string, including values Hunch does not store. */
  status: string;
  /** Attempt number, 0 for the first try. */
  retry: number;
}

/** Facts about the run as a whole, resolved once rather than per test. */
export interface RunContext {
  commitSha: string;
  branch: string;
  changedFiles: string[];
}

/** Playwright statuses that say something about the test, mapped to what we store. */
const STORED_STATUSES: Record<string, TestStatus> = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  timedOut: 'timedOut',
};

/**
 * Builds the identifier that ties a test to its history across runs.
 *
 * The identity is the file plus the full title path, which is what a human would use to point
 * at a test. Renaming a test therefore starts its history over. That is the honest behaviour:
 * a renamed test is usually an edited test, and carrying the old failure record forward would
 * teach the model something that is no longer true.
 */
export function buildTestId(file: string, describes: string[], title: string): string {
  return [toPosixPath(file), ...describes, title].join(' > ');
}

/**
 * Converts a finished test into a record, or returns null when there is nothing worth storing.
 *
 * Playwright also reports `interrupted`, which happens when the run was cut short rather than
 * when the test decided anything. Recording it as a failure would teach the model that a
 * cancelled CI job means broken tests, so those attempts are dropped instead.
 */
export function toRecord(test: FinishedTest, context: RunContext, now: Date): TestRecord | null {
  const status = STORED_STATUSES[test.status];
  if (!status) {
    return null;
  }

  return {
    testId: buildTestId(test.file, test.describes, test.title),
    file: toPosixPath(test.file),
    project: test.project,
    duration: test.duration,
    status,
    timestamp: now.toISOString(),
    commitSha: context.commitSha,
    changedFiles: context.changedFiles,
    branch: context.branch,
    retry: test.retry,
  };
}

/**
 * Accumulates records during a run and writes them once at the end.
 *
 * Buffering is what keeps the history file safe: the whole run lands in a single append, so
 * two `playwright test` processes running at once cannot interleave half written lines.
 */
export class Collector {
  private readonly records: TestRecord[] = [];

  constructor(
    private readonly filePath: string,
    private readonly context: RunContext,
  ) {}

  /** Records a finished attempt, ignoring the ones that carry no signal. */
  add(test: FinishedTest, now = new Date()): void {
    const record = toRecord(test, this.context, now);
    if (record) {
      this.records.push(record);
    }
  }

  /** How many records are waiting to be written. */
  get size(): number {
    return this.records.length;
  }

  /**
   * Writes everything collected so far and empties the buffer.
   *
   * Returns the number of records written. Failing to write history must never fail a test
   * run, so the caller decides what to do with an error rather than having one thrown at the
   * end of somebody's suite.
   */
  flush(): number {
    const count = this.records.length;
    appendRecords(this.filePath, this.records);
    this.records.length = 0;
    return count;
  }
}

/** Normalises a path so history written on Windows matches history written on Linux. */
function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}
