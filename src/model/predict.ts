import type { HunchModel, Prediction } from '../types.js';
import { extractFeatures, type HistoryIndex } from './features.js';
import { score } from './train.js';

/**
 * Turning a model into a decision about which tests to run.
 *
 * The scoring is arithmetic. The part worth reading carefully is the selection, because the
 * cost of the two mistakes is not symmetric: running a test that would have passed wastes a few
 * seconds, while skipping one that would have failed lets a bug through. Everything below is
 * biased accordingly.
 */

/** A test that could be run, as discovered from the suite rather than from history. */
export interface Candidate {
  testId: string;
  /** Test file, relative to the repository root, with forward slashes. */
  file: string;
}

/** Scores every candidate against the current change set, highest risk first. */
export function predict(
  model: HunchModel,
  index: HistoryIndex,
  candidates: Candidate[],
  changedFiles: string[],
): Prediction[] {
  return candidates
    .map((candidate) => ({
      testId: candidate.testId,
      score: score(
        model.weights,
        extractFeatures(index, candidate.testId, candidate.file, changedFiles),
      ),
    }))
    .sort((a, b) => b.score - a.score);
}

/** How the selection was made, in enough detail to explain it to the user. */
export interface Selection {
  /** Tests that will run. */
  selected: string[];
  /** Tests that will not. */
  skipped: string[];
  /** Selected because they have no history, not because the model rated them highly. */
  unknown: string[];
}

/** Knobs for choosing how much of the suite to run. */
export interface SelectionOptions {
  /** Fraction of the suite to run, between 0 and 1. */
  ratio: number;
  /** Never run fewer than this many tests. */
  minTests: number;
}

/**
 * Chooses which tests to run.
 *
 * Two rules, both there to stop the tool being confidently wrong:
 *
 * A test the model has never seen is always run. No history means no prediction, and skipping
 * a test because nothing is known about it would silently drop every test somebody added this
 * week, which is exactly the code most likely to be broken.
 *
 * The floor on the number of tests applies after that. A ratio of 30% of a five test suite is
 * one test, which is not test selection, it is a coin toss with extra steps.
 */
export function selectTests(
  predictions: Prediction[],
  index: HistoryIndex,
  options: SelectionOptions,
): Selection {
  const unknown = predictions
    .filter((prediction) => !index.tests.has(prediction.testId))
    .map((prediction) => prediction.testId);

  const known = predictions.filter((prediction) => index.tests.has(prediction.testId));

  const target = Math.max(
    Math.ceil(predictions.length * clamp(options.ratio)),
    Math.max(options.minTests, 0),
  );
  const fromModel = Math.max(target - unknown.length, 0);

  const selected = new Set(unknown);
  for (const prediction of known.slice(0, fromModel)) {
    selected.add(prediction.testId);
  }

  return {
    selected: predictions.filter((p) => selected.has(p.testId)).map((p) => p.testId),
    skipped: predictions.filter((p) => !selected.has(p.testId)).map((p) => p.testId),
    unknown,
  };
}

/** Keeps a ratio inside the range it is documented to have. */
function clamp(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return Math.min(Math.max(ratio, 0), 1);
}

/**
 * Estimated time the skipped tests would have taken, in milliseconds.
 *
 * Taken from each test's own historical mean rather than a suite average, because the whole
 * point is that tests differ. A test with no history contributes nothing, which understates
 * the saving; understating it is the right direction for a number used in marketing.
 */
export function estimateSkippedDuration(index: HistoryIndex, skipped: string[]): number {
  let total = 0;
  for (const testId of skipped) {
    const stats = index.tests.get(testId);
    if (stats && stats.appearances > 0) {
      total += stats.totalDuration / stats.appearances;
    }
  }
  return total;
}
