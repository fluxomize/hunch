import { join } from 'node:path';
import type { Command } from 'commander';
import { DEFAULT_CONFIG, HISTORY_FILE, MODEL_FILE } from '../config.js';
import { getChangedFiles, getRepositoryRoot, isGitRepository } from '../git/index.js';
import { buildIndex } from '../model/features.js';
import { estimateSkippedDuration, predict, selectTests } from '../model/predict.js';
import { estimateSavings } from '../metrics/carbon.js';
import { formatCarbon, formatDuration, formatEnergy } from '../metrics/format.js';
import { readRecords } from '../storage/jsonl.js';
import { InvalidModelError, readModel } from '../storage/model.js';
import {
  PlaywrightNotFoundError,
  grepWasDropped,
  listTests,
  runTests,
  type DiscoveredTest,
} from '../runner/playwright.js';

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
  /** Flags written after `--`, forwarded verbatim to `playwright test`. */
  playwrightArgs: string[];
}

/** Wires `hunch run` into the CLI. */
export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run only the tests the model expects to fail for the current changes')
    // Declaring the variadic argument is what makes `hunch run -- --project=chromium` legal.
    // Without it commander treats the forwarded flags as excess arguments and errors out.
    .argument('[playwright-args...]', 'flags after -- are passed straight to playwright test')
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
    .action((playwrightArgs: string[], options: Omit<RunOptions, 'playwrightArgs'>) =>
      run({ ...options, playwrightArgs }),
    );
}

/**
 * Scores the suite against the current diff and hands the selection to Playwright.
 *
 * Whenever this cannot do its job, it says why and runs nothing rather than guessing. A test
 * selector that silently falls back to a partial run is worse than one that refuses: the user
 * would believe they had been tested when they had not.
 */
export async function run(options: RunOptions): Promise<void> {
  const cwd = process.cwd();
  if (!isGitRepository({ cwd })) {
    fail('Not a git repository, so there are no changes to predict from.');
    return;
  }
  const repoRoot = getRepositoryRoot({ cwd }) || cwd;

  const model = loadModel(join(options.dir, MODEL_FILE));
  if (!model) {
    return;
  }

  const records = readRecords(join(options.dir, HISTORY_FILE));
  const index = buildIndex(records);
  const changedFiles = getChangedFiles(options.diff, { cwd });

  let discovered: DiscoveredTest[];
  try {
    discovered = listTests({ cwd, repoRoot, extraArgs: options.playwrightArgs });
  } catch (error) {
    fail(error instanceof PlaywrightNotFoundError ? error.message : String(error));
    return;
  }

  if (discovered.length === 0) {
    fail('Playwright found no tests to choose from.');
    return;
  }

  const predictions = predict(model, index, discovered, changedFiles);
  const selection = selectTests(predictions, index, {
    ratio: options.ratio,
    minTests: options.minTests,
  });

  const byId = new Map(discovered.map((test) => [test.testId, test]));
  const selectedTests = selection.selected
    .map((testId) => byId.get(testId))
    .filter((test): test is DiscoveredTest => test !== undefined);

  describeSelection(selection, discovered.length, changedFiles, selectedTests);

  if (options.dryRun) {
    process.stdout.write('\nDry run, so nothing was executed.\n');
    return;
  }

  const exitCode = runTests({
    cwd,
    repoRoot,
    tests: selectedTests,
    extraArgs: options.playwrightArgs,
  });

  reportSavings(index, selection.skipped);
  process.exitCode = exitCode;
}

/** Loads the model, explaining what to do when there is not a usable one. */
function loadModel(modelPath: string): ReturnType<typeof readModel> {
  try {
    const model = readModel(modelPath);
    if (!model) {
      fail(
        `No model at ${modelPath}.`,
        'Run `hunch train` first. It needs around 20 to 30 runs of history, which the',
        'reporter collects while you work.',
      );
      return null;
    }
    return model;
  } catch (error) {
    fail(error instanceof InvalidModelError ? error.message : String(error));
    return null;
  }
}

/** Says what was chosen and why, before anything runs. */
function describeSelection(
  selection: { selected: string[]; skipped: string[]; unknown: string[] },
  total: number,
  changedFiles: string[],
  selectedTests: DiscoveredTest[],
): void {
  const lines = [
    `Selected ${selection.selected.length} of ${total} tests, ` +
      `from ${changedFiles.length} changed file(s).`,
  ];

  if (selection.unknown.length > 0) {
    lines.push(
      `  ${selection.unknown.length} of them have no history yet and are run regardless, ` +
        'because nothing is known about them.',
    );
  }

  if (grepWasDropped(selectedTests)) {
    lines.push(
      '  The selection was too large to express as a title filter, so whole files were',
      '  selected instead. Fewer tests are skipped than the model asked for.',
    );
  }

  process.stdout.write(lines.join('\n') + '\n');
}

/**
 * Reports what not running the rest is estimated to have saved.
 *
 * Every number here is an estimate built from the user's own history and two configurable
 * assumptions, and it is labelled as one. Overstating this would be the easiest and cheapest
 * lie this project could tell, which is reason enough to be careful with it.
 */
function reportSavings(index: ReturnType<typeof buildIndex>, skipped: string[]): void {
  if (skipped.length === 0) {
    return;
  }

  const durationMs = estimateSkippedDuration(index, skipped);
  if (durationMs <= 0) {
    return;
  }

  const saved = estimateSavings(durationMs);
  process.stdout.write(
    [
      '',
      `Skipped ${skipped.length} test(s), historically ${formatDuration(durationMs)} of machine time.`,
      `Estimated saving: ${formatEnergy(saved.kWh)}, ${formatCarbon(saved.gCo2eq)}.`,
      'Estimates, from your own history and the documented default assumptions about runner',
      'power draw and grid carbon intensity. Not measurements.',
      '',
    ].join('\n'),
  );
}

/** Explains why nothing ran, and exits non zero without a stack trace. */
function fail(...lines: string[]): void {
  process.stderr.write(lines.join('\n') + '\n');
  process.exitCode = 1;
}
