import { join } from 'node:path';
import type { Command } from 'commander';
import { DEFAULT_CONFIG, HISTORY_FILE, MODEL_FILE } from '../config.js';
import { getRepositoryRoot } from '../git/index.js';
import { resolveDataDir } from './data-dir.js';
import { InvalidConfigError, resolveConfig } from '../user-config.js';
import { buildTrainingSet, groupIntoRuns } from '../model/features.js';
import { NotEnoughSignalError, trainModel } from '../model/train.js';
import { readRecords } from '../storage/jsonl.js';
import { writeModel } from '../storage/model.js';
import type { HunchModel } from '../types.js';

/** Options accepted by `hunch train`. */
export interface TrainOptions {
  /** Directory holding the history file and receiving the model, if given explicitly. */
  dir?: string;
  /** Refuse to train with fewer historical runs than this. Falls back to the config file. */
  minRuns?: number;
}

/** Wires `hunch train` into the CLI. */
export function registerTrainCommand(program: Command): void {
  program
    .command('train')
    .description('Train the failure prediction model from .hunch/history.jsonl')
    .option(
      '-d, --dir <path>',
      `directory holding Hunch data (default: ${DEFAULT_CONFIG.outputDir} at the repository root)`,
    )
    .option(
      '--min-runs <n>',
      `minimum number of historical runs required to train (default: ${DEFAULT_CONFIG.minRunsToTrain})`,
      (value: string) => Number.parseInt(value, 10),
    )
    .action(train);
}

/**
 * Reads the history, builds feature vectors and fits the model.
 *
 * Every way this can refuse to train says what is missing and what to do about it. A silent
 * or cryptic failure here would leave someone with no idea whether Hunch is working, and the
 * honest answer early on is usually "keep running your tests for another week".
 */
export async function train(options: TrainOptions): Promise<void> {
  const dir = resolveDataDir(options.dir);

  // The config file lives at the top of the working tree, wherever the data directory was
  // pointed. Deriving it from the data directory would be wrong the moment somebody passes an
  // explicit --dir somewhere else.
  const repoRoot = getRepositoryRoot({ cwd: process.cwd() }) || process.cwd();

  let minRuns: number;
  try {
    minRuns = resolveConfig(repoRoot, { minRunsToTrain: options.minRuns }).minRunsToTrain;
  } catch (error) {
    fail(error instanceof InvalidConfigError ? error.message : String(error));
    return;
  }

  const historyPath = join(dir, HISTORY_FILE);
  const modelPath = join(dir, MODEL_FILE);

  const records = readRecords(historyPath);
  if (records.length === 0) {
    fail(
      `No history at ${historyPath}.`,
      'Add the reporter to your Playwright config and run your suite a few times:',
      "  reporter: [['list'], ['@fluxomize/hunch/reporter']]",
    );
    return;
  }

  const runs = groupIntoRuns(records).length;
  if (runs < minRuns) {
    fail(
      `Only ${runs} run(s) of history, and training needs at least ${minRuns}.`,
      'A model trained on less than that would mostly be repeating noise back at you.',
      'Keep running your suite; the reporter is already collecting.',
    );
    return;
  }

  const set = buildTrainingSet(records);

  let model: HunchModel;
  try {
    model = trainModel(set);
  } catch (error) {
    if (error instanceof NotEnoughSignalError) {
      fail(`Cannot train: ${error.message}.`);
      return;
    }
    throw error;
  }

  writeModel(modelPath, model);
  report(model, runs, set.rows.length, modelPath);
}

/** Prints the quality of what was just trained, in full, including when it is bad. */
function report(model: HunchModel, runs: number, examples: number, modelPath: string): void {
  const { precision, recall, f1, confusion } = model.metrics;
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

  const lines = [
    `Trained on ${runs} runs, ${examples} examples.`,
    '',
    'Quality at the usual 50% cutoff, measured on the most recent runs the model never saw.',
    '`hunch run` ranks tests rather than applying this cutoff, so it can still be useful with',
    'a recall that looks modest here:',
    `  precision  ${percent(precision)}  of the tests it flags, this many really fail`,
    `  recall     ${percent(recall)}  of the tests that fail, this many get flagged`,
    `  F1         ${percent(f1)}`,
    '',
    `  predicted fail, did fail    ${confusion.truePositives}`,
    `  predicted fail, passed      ${confusion.falsePositives}`,
    `  predicted pass, did fail    ${confusion.falseNegatives}`,
    `  predicted pass, passed      ${confusion.trueNegatives}`,
    '',
    'Weights, largest influence first:',
    ...describeWeights(model),
    '',
    'A weight of exactly zero means the feature never varied in your history, so there was',
    'nothing for it to explain. Features that measure much the same thing can end up with',
    'large opposing weights; read them together rather than one at a time.',
    '',
    `Written to ${modelPath}`,
  ];

  process.stdout.write(lines.join('\n') + '\n');

  if (recall < 0.5) {
    process.stdout.write(
      '\nRecall below 50% means the model misses more failures than it catches. ' +
        'More history will usually fix it; until then, treat its picks as a hint.\n',
    );
  }
}

/** Lists the features by how much they moved the prediction, so the model can be argued with. */
function describeWeights(model: HunchModel): string[] {
  return model.featureNames
    .map((name, index) => ({ name, weight: model.weights[index] ?? 0 }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .map(
      ({ name, weight }) => `  ${weight >= 0 ? '+' : '-'}${Math.abs(weight).toFixed(3)}  ${name}`,
    );
}

/** Explains why training did not happen, and exits non zero without a stack trace. */
function fail(...lines: string[]): void {
  process.stderr.write(lines.join('\n') + '\n');
  process.exitCode = 1;
}
