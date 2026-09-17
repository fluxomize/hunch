import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { HISTORY_FILE, HUNCH_DIR } from '../config.js';
import {
  getBranch,
  getChangedFiles,
  getCommitSha,
  getRepositoryRoot,
  isGitRepository,
} from '../git/index.js';
import type { ReporterOptions } from '../types.js';
import { Collector } from './collector.js';

/**
 * Playwright reporter that records every test result into `.hunch/history.jsonl`.
 *
 * The one rule this class follows above all others: a reporter must never be the reason a
 * suite fails. Every path that touches git or the filesystem is wrapped, and a failure to
 * collect history degrades to a warning, never to a non-zero exit.
 */
export default class HunchReporter implements Reporter {
  private readonly options: ReporterOptions;
  private collector: Collector | undefined;
  private repoRoot = process.cwd();

  constructor(options: ReporterOptions = {}) {
    this.options = options;
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    // Playwright's `rootDir` is the resolved `testDir`, not the project root, so it is only
    // useful here as a place to run git from. Everything Hunch writes is anchored at the top
    // of the working tree instead: that is where git reports changed files from, and it does
    // not move when somebody points `testDir` somewhere else.
    const cwd = config.rootDir || process.cwd();

    try {
      if (!isGitRepository({ cwd })) {
        this.warn('not a git repository, so no history will be recorded');
        return;
      }

      this.repoRoot = getRepositoryRoot({ cwd }) || cwd;

      // Git is asked once per run rather than once per test. The commit and the changed files
      // are the same for every test in the run, and shelling out per test would show up in
      // the suite's own timing, which is precisely what Hunch exists to protect.
      const context = {
        commitSha: getCommitSha({ cwd }),
        branch: getBranch({ cwd }),
        changedFiles: getChangedFiles(this.options.diffRange ?? 'HEAD~1..HEAD', { cwd }),
        runId: randomUUID(),
      };

      const outputDir = this.options.outputDir ?? HUNCH_DIR;
      this.collector = new Collector(join(this.repoRoot, outputDir, HISTORY_FILE), context);
      this.log(`collecting history against ${context.changedFiles.length} changed file(s)`);
    } catch (error) {
      this.warn(`could not read the repository, so no history will be recorded: ${message(error)}`);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!this.collector) {
      return;
    }
    try {
      this.collector.add({
        file: relative(this.repoRoot, test.location.file),
        describes: describeTitles(test),
        title: test.title,
        project: projectName(test),
        duration: result.duration,
        status: result.status,
        retry: result.retry,
      });
    } catch (error) {
      this.warn(`could not record ${test.title}: ${message(error)}`);
    }
  }

  onEnd(): void {
    if (!this.collector) {
      return;
    }
    try {
      const written = this.collector.flush();
      this.log(`wrote ${written} record(s) to ${this.options.outputDir ?? HUNCH_DIR}`);
    } catch (error) {
      this.warn(`could not write history: ${message(error)}`);
    }
  }

  /** Hunch stays out of the terminal unless it is asked to speak, or has bad news. */
  printsToStdio(): boolean {
    return this.options.verbose === true;
  }

  private log(text: string): void {
    if (this.options.verbose) {
      process.stdout.write(`[hunch] ${text}\n`);
    }
  }

  private warn(text: string): void {
    process.stderr.write(`[hunch] ${text}\n`);
  }
}

/**
 * Titles of the describe blocks around a test, outermost first.
 *
 * Playwright nests a test under a root suite, a project suite and a file suite before any
 * describe blocks, so walking the ancestors and keeping only the describes is what produces
 * the title path a human would recognise.
 */
function describeTitles(test: TestCase): string[] {
  const titles: string[] = [];
  for (let suite: Suite | undefined = test.parent; suite; suite = suite.parent) {
    if (suite.title && suite.type === 'describe') {
      titles.unshift(suite.title);
    }
  }
  return titles;
}

/** Name of the project a test ran under, or an empty string when projects are not configured. */
function projectName(test: TestCase): string {
  return test.parent?.project()?.name ?? '';
}

/** Error messages, without assuming anything about what was thrown. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
