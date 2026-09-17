import { join } from 'node:path';
import type { Command } from 'commander';
import { DEFAULT_CONFIG, HISTORY_FILE, MODEL_FILE } from '../config.js';
import { getRepositoryRoot } from '../git/index.js';
import { buildIndex, groupIntoRuns } from '../model/features.js';
import { readRecords } from '../storage/jsonl.js';
import { InvalidModelError, readModel } from '../storage/model.js';
import { formatDuration } from '../metrics/format.js';
import { resolveDataDir } from './data-dir.js';
import { InvalidConfigError, resolveConfig } from '../user-config.js';
import type { HunchModel, TestRecord } from '../types.js';

/**
 * `hunch stats`: what Hunch knows so far.
 *
 * Every user spends their first weeks collecting history before anything else works. Without
 * this command that period is silent, and silence is indistinguishable from the tool being
 * broken. This answers the two questions somebody actually has during it: is it collecting,
 * and how much longer.
 */

/** Options accepted by `hunch stats`. */
export interface StatsOptions {
  /** Directory holding Hunch data, if given explicitly. */
  dir?: string;
  /** How many tests to list in the rankings. */
  top: number;
}

/** Wires `hunch stats` into the CLI. */
export function registerStatsCommand(program: Command): void {
  program
    .command('stats')
    .description('Show what Hunch has collected, and the quality of the current model')
    .option(
      '-d, --dir <path>',
      `directory holding Hunch data (default: ${DEFAULT_CONFIG.outputDir} at the repository root)`,
    )
    .option('--top <n>', 'how many tests to list', (value: string) => Number.parseInt(value, 10), 5)
    .action(stats);
}

/** Prints a summary of the history and the model, if there is one. */
export async function stats(options: StatsOptions): Promise<void> {
  const dir = resolveDataDir(options.dir);
  const repoRoot = getRepositoryRoot({ cwd: process.cwd() }) || process.cwd();

  let minRunsToTrain: number;
  try {
    minRunsToTrain = resolveConfig(repoRoot).minRunsToTrain;
  } catch (error) {
    fail(error instanceof InvalidConfigError ? error.message : String(error));
    return;
  }

  const records = readRecords(join(dir, HISTORY_FILE));
  if (records.length === 0) {
    fail(
      `No history at ${join(dir, HISTORY_FILE)}.`,
      'Add the reporter to your Playwright config and run your suite:',
      "  reporter: [['list'], ['@fluxomize/hunch/reporter']]",
    );
    return;
  }

  const lines = [...describeHistory(records, minRunsToTrain, options.top)];

  let model: HunchModel | null = null;
  try {
    model = readModel(join(dir, MODEL_FILE));
  } catch (error) {
    lines.push('', `Model: ${error instanceof InvalidModelError ? error.message : String(error)}`);
  }
  lines.push('', ...describeModel(model));

  process.stdout.write(lines.join('\n') + '\n');
}

/** The part somebody checks while they wait for enough history to train on. */
function* describeHistory(
  records: TestRecord[],
  minRunsToTrain: number,
  top: number,
): Generator<string> {
  const runs = groupIntoRuns(records);
  const index = buildIndex(records);

  yield `History: ${runs.length} runs, ${index.tests.size} tests, ${records.length} records.`;

  const first = runs[0]?.timestamp;
  const last = runs.at(-1)?.timestamp;
  if (first && last && first !== last) {
    yield `  Collected from ${first.slice(0, 10)} to ${last.slice(0, 10)}.`;
  }

  if (runs.length < minRunsToTrain) {
    yield `  ${minRunsToTrain - runs.length} more run(s) before \`hunch train\` will train.`;
  } else {
    yield '  Enough history to train. Run `hunch train`.';
  }

  const ranked = [...index.tests.entries()].map(([testId, testStats]) => ({
    testId,
    failureRate: testStats.failures / testStats.appearances,
    flakyRate: testStats.flakyRuns / testStats.appearances,
    meanDuration: testStats.totalDuration / testStats.appearances,
  }));

  yield* rank(
    'Fails most often',
    ranked,
    (entry) => entry.failureRate,
    top,
    (value) => `${(value * 100).toFixed(0)}%`,
  );
  yield* rank(
    'Flakiest',
    ranked,
    (entry) => entry.flakyRate,
    top,
    (value) => `${(value * 100).toFixed(0)}%`,
  );
  yield* rank('Slowest', ranked, (entry) => entry.meanDuration, top, formatDuration);
}

/** One ranked list, printed only when there is something in it worth ranking. */
function* rank<T extends { testId: string }>(
  title: string,
  entries: T[],
  by: (entry: T) => number,
  top: number,
  format: (value: number) => string,
): Generator<string> {
  const ordered = entries
    .filter((entry) => by(entry) > 0)
    .sort((a, b) => by(b) - by(a))
    .slice(0, Math.max(top, 0));

  if (ordered.length === 0) {
    return;
  }

  yield '';
  yield `${title}:`;
  for (const entry of ordered) {
    yield `  ${format(by(entry)).padStart(6)}  ${entry.testId}`;
  }
}

/** The model's own report card, or a nudge towards making one. */
function* describeModel(model: HunchModel | null): Generator<string> {
  if (!model) {
    yield 'Model: none yet.';
    return;
  }

  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
  yield `Model: trained ${model.trainedAt.slice(0, 10)} on ${model.trainingSetSize} examples.`;
  yield `  precision ${percent(model.metrics.precision)}, recall ${percent(model.metrics.recall)}, F1 ${percent(model.metrics.f1)}`;

  const influences = model.featureNames
    .map((name, position) => ({ name, weight: model.weights[position] ?? 0 }))
    .filter((entry) => entry.name !== 'bias')
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 3)
    .map((entry) => `${entry.name} ${entry.weight >= 0 ? '+' : ''}${entry.weight.toFixed(2)}`);

  yield `  Strongest signals: ${influences.join(', ')}`;
}

/** Explains why there is nothing to show, and exits non zero without a stack trace. */
function fail(...lines: string[]): void {
  process.stderr.write(lines.join('\n') + '\n');
  process.exitCode = 1;
}
