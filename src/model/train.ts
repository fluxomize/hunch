import LogisticRegression from 'ml-logistic-regression';
import { Matrix } from 'ml-matrix';
import type { HunchModel, ModelMetrics } from '../types.js';
import type { TrainingSet } from './features.js';

/**
 * Fitting the baseline model.
 *
 * `ml-logistic-regression` does the gradient descent, but it is a deliberately bare
 * implementation and three of its gaps have to be closed here rather than ignored:
 *
 * 1. It fits no intercept. The feature vectors therefore carry an explicit `bias` feature that
 *    is always 1, so the model can learn a base rate instead of being forced through the
 *    midpoint at the average of the inputs.
 * 2. It does not scale features. Every feature produced by `features.ts` is already bounded to
 *    roughly [0, 1] for that reason.
 * 3. Its gradient is a sum over examples rather than a mean, so the effective step size grows
 *    with the size of the history and a big enough dataset would make it diverge. The learning
 *    rate passed to it is divided by the number of examples to compensate.
 *
 * What it still does not do is regularise. With a baseline model, a dozen features and the
 * twenty to thirty runs this is designed for, that is a real risk of overfitting, which is why
 * the quality report below is measured on runs the model never saw and printed whether it
 * flatters the model or not.
 */

/** Knobs for fitting. The defaults are what `hunch train` uses. */
export interface TrainOptions {
  /** Gradient descent iterations. */
  steps?: number;
  /** Step size, before it is divided by the number of examples. */
  learningRate?: number;
  /** Fraction of the most recent examples held back to measure quality. */
  holdoutRatio?: number;
}

const DEFAULT_STEPS = 4000;
const DEFAULT_LEARNING_RATE = 2;
const DEFAULT_HOLDOUT_RATIO = 0.25;

/** Why a training set cannot be learned from. */
export class NotEnoughSignalError extends Error {}

/**
 * Fits the model and measures it.
 *
 * The holdout is the most recent slice of history rather than a random sample, because the
 * question being asked is "will this predict the next run", not "can it memorise the middle of
 * last month". A random split would also leak: two examples from the same run are not
 * independent.
 */
export function trainModel(set: TrainingSet, options: TrainOptions = {}): HunchModel {
  const { rows, labels, featureNames } = set;

  if (rows.length === 0) {
    throw new NotEnoughSignalError('there are no training examples in this history');
  }

  const failures = labels.filter((label) => label === 1).length;
  if (failures === 0) {
    throw new NotEnoughSignalError(
      'no test has ever failed in this history, so there is nothing to predict',
    );
  }
  if (failures === labels.length) {
    throw new NotEnoughSignalError(
      'every recorded test has failed, so there is nothing to tell apart',
    );
  }

  const holdoutRatio = options.holdoutRatio ?? DEFAULT_HOLDOUT_RATIO;
  const splitAt = Math.max(1, Math.floor(rows.length * (1 - holdoutRatio)));
  const trainRows = rows.slice(0, splitAt);
  const trainLabels = labels.slice(0, splitAt);
  const evalRows = rows.slice(splitAt);
  const evalLabels = labels.slice(splitAt);

  const weights = fit(trainRows, trainLabels, options);

  // Measure on the held out slice when there is one, and fall back to the training slice when
  // history is too short to spare any. The fallback is generous to the model, so it is called
  // out rather than quietly reported as if it meant the same thing.
  const measuredOn = evalRows.length > 0 ? { rows: evalRows, labels: evalLabels } : null;
  const metrics = measure(
    weights,
    measuredOn?.rows ?? trainRows,
    measuredOn?.labels ?? trainLabels,
  );

  return {
    schemaVersion: 1,
    algorithm: 'logistic-regression',
    featureNames: [...featureNames],
    weights,
    trainedAt: new Date().toISOString(),
    trainingSetSize: trainRows.length,
    metrics,
  };
}

/**
 * Runs the regression and returns the learned weights.
 *
 * `LogisticRegression` trains one classifier per class, and for two classes the first one is
 * the one that predicts label 1. That is an internal detail of the library, so the test suite
 * asserts the resulting model actually ranks a known failing pattern above a known passing one
 * rather than trusting the convention to stay put.
 */
function fit(rows: number[][], labels: number[], options: TrainOptions): number[] {
  const steps = options.steps ?? DEFAULT_STEPS;
  const learningRate = (options.learningRate ?? DEFAULT_LEARNING_RATE) / rows.length;

  const regression = new LogisticRegression({ numSteps: steps, learningRate });
  regression.train(new Matrix(rows), Matrix.columnVector(labels));

  const classifier = regression.classifiers[0] as { weights: Matrix } | undefined;
  /* c8 ignore next 3 */
  if (!classifier) {
    throw new NotEnoughSignalError('the regression produced no classifier');
  }
  return classifier.weights.to1DArray();
}

/** Probability that a test with these features fails, between 0 and 1. */
export function score(weights: number[], features: number[]): number {
  let sum = 0;
  const length = Math.min(weights.length, features.length);
  for (let i = 0; i < length; i += 1) {
    sum += (weights[i] as number) * (features[i] as number);
  }
  return 1 / (1 + Math.exp(-sum));
}

/** Precision, recall, F1 and the confusion matrix at the usual 0.5 threshold. */
export function measure(weights: number[], rows: number[][], labels: number[]): ModelMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const predicted = score(weights, rows[i] as number[]) >= 0.5;
    const actual = labels[i] === 1;
    if (predicted && actual) {
      truePositives += 1;
    } else if (predicted && !actual) {
      falsePositives += 1;
    } else if (!predicted && actual) {
      falseNegatives += 1;
    } else {
      trueNegatives += 1;
    }
  }

  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision,
    recall,
    f1,
    confusion: { truePositives, falsePositives, trueNegatives, falseNegatives },
  };
}

/** Division that returns 0 rather than NaN when nothing was predicted. */
function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
