import type { Reporter } from '@playwright/test/reporter';
import type { ReporterOptions } from '../types.js';

/**
 * Playwright reporter that records every test result into `.hunch/history.jsonl`.
 *
 * The collection logic is not implemented yet, so this release is a no-op placeholder that
 * keeps the module path stable. A reporter must never be the reason a suite fails, so this
 * class deliberately swallows nothing and does nothing.
 */
export default class HunchReporter implements Reporter {
  private readonly options: ReporterOptions;

  constructor(options: ReporterOptions = {}) {
    this.options = options;
  }

  onBegin(): void {
    if (this.options.verbose) {
      process.stdout.write('[hunch] reporter loaded, collection is not implemented yet\n');
    }
  }

  /** Hunch runs after the suite and reports nothing to the terminal, so ordering is irrelevant. */
  printsToStdio(): boolean {
    return this.options.verbose === true;
  }
}
