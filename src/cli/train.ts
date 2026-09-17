import type { Command } from 'commander';
import { DEFAULT_CONFIG } from '../config.js';

/** Options accepted by `hunch train`. */
export interface TrainOptions {
  /** Directory holding the history file and receiving the model. */
  dir: string;
  /** Refuse to train with fewer historical runs than this. */
  minRuns: number;
}

/** Wires `hunch train` into the CLI. */
export function registerTrainCommand(program: Command): void {
  program
    .command('train')
    .description('Train the failure prediction model from .hunch/history.jsonl')
    .option('-d, --dir <path>', 'directory holding Hunch data', DEFAULT_CONFIG.outputDir)
    .option(
      '--min-runs <n>',
      'minimum number of historical runs required to train',
      (value: string) => Number.parseInt(value, 10),
      DEFAULT_CONFIG.minRunsToTrain,
    )
    .action(train);
}

/**
 * Reads the history file, builds feature vectors and fits the logistic regression model.
 *
 * Not implemented yet. Tracked for v0.2, see the roadmap in the README.
 */
export async function train(_options: TrainOptions): Promise<void> {
  process.stderr.write(
    'hunch train is not implemented yet. This release only reserves the package name.\n',
  );
  process.exitCode = 1;
}
