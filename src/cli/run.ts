import type { Command } from 'commander';
import { DEFAULT_CONFIG } from '../config.js';

/** Options accepted by `hunch run`. */
export interface RunOptions {
  /** Directory holding the model and the history file. */
  dir: string;
  /** Fraction of the suite to run, between 0 and 1. */
  ratio: number;
  /** Floor on the number of selected tests, whatever the ratio works out to. */
  minTests: number;
  /** Git revision range used to decide which files changed. */
  diff: string;
  /** Select and print the tests without handing them to Playwright. */
  dryRun?: boolean;
}

/** Wires `hunch run` into the CLI. */
export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run only the tests the model expects to fail for the current changes')
    .option('-d, --dir <path>', 'directory holding Hunch data', DEFAULT_CONFIG.outputDir)
    .option(
      '-r, --ratio <n>',
      'fraction of the suite to run, between 0 and 1',
      (value: string) => Number.parseFloat(value),
      DEFAULT_CONFIG.selectionRatio,
    )
    .option(
      '--min-tests <n>',
      'never select fewer tests than this',
      (value: string) => Number.parseInt(value, 10),
      DEFAULT_CONFIG.minTests,
    )
    .option('--diff <range>', 'git revision range to compare against', 'HEAD~1..HEAD')
    .option('--dry-run', 'print the selection without running Playwright')
    .allowUnknownOption()
    .passThroughOptions()
    .action(run);
}

/**
 * Scores the suite against the current diff and hands the selection to Playwright.
 *
 * Not implemented yet. Tracked for v0.3, see the roadmap in the README.
 */
export async function run(_options: RunOptions): Promise<void> {
  process.stderr.write(
    'hunch run is not implemented yet. This release only reserves the package name.\n',
  );
  process.exitCode = 1;
}
