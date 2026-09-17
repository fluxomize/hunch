import { describe, expect, it } from 'vitest';
import {
  FEATURE_NAMES,
  buildIndex,
  buildTrainingSet,
  extractFeatures,
} from '../src/model/features.js';
import { NotEnoughSignalError, measure, score, trainModel } from '../src/model/train.js';
import type { TrainingSet } from '../src/model/features.js';
import { SYNTHETIC, syntheticHistory } from './support/synthetic.js';

const set = (rows: number[][], labels: number[]): TrainingSet => ({
  featureNames: [...FEATURE_NAMES],
  rows,
  labels,
  runCount: rows.length,
});

describe('refusing to train', () => {
  it('refuses an empty history', () => {
    expect(() => trainModel(set([], []))).toThrow(NotEnoughSignalError);
  });

  it('refuses a history where nothing ever failed', () => {
    // Genuinely good news, and still nothing to learn. Saying so is better than returning a
    // model that predicts the same number for everything.
    const rows = Array.from({ length: 20 }, () => [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() =>
      trainModel(
        set(
          rows,
          rows.map(() => 0),
        ),
      ),
    ).toThrow(/never failed|nothing to predict/);
  });

  it('refuses a history where everything failed', () => {
    const rows = Array.from({ length: 20 }, () => [1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]);
    expect(() =>
      trainModel(
        set(
          rows,
          rows.map(() => 1),
        ),
      ),
    ).toThrow(/nothing to tell apart/);
  });
});

describe('the trained model', () => {
  const trained = trainModel(buildTrainingSet(syntheticHistory({ runs: 60 })));

  it('records what it is and how it was made', () => {
    expect(trained.schemaVersion).toBe(1);
    expect(trained.algorithm).toBe('logistic-regression');
    expect(trained.trainingSetSize).toBeGreaterThan(0);
    expect(Date.parse(trained.trainedAt)).not.toBeNaN();
  });

  it('has one weight per feature name', () => {
    expect(trained.weights).toHaveLength(trained.featureNames.length);
    expect(trained.weights.every(Number.isFinite)).toBe(true);
  });

  it('finds the planted correlation', () => {
    // The assertion this whole module exists for. The library's one versus all convention is
    // an internal detail, so rather than trusting it, check the model ranks a change that
    // really does break a test above one that does not.
    const index = buildIndex(syntheticHistory({ runs: 60 }));
    const guilty = extractFeatures(index, SYNTHETIC.authTest.testId, SYNTHETIC.authTest.file, [
      'src/auth.ts',
    ]);
    const harmless = extractFeatures(index, SYNTHETIC.authTest.testId, SYNTHETIC.authTest.file, [
      'styles/main.css',
    ]);

    expect(score(trained.weights, guilty)).toBeGreaterThan(score(trained.weights, harmless));
  });

  it('learns that a test touched by everything and broken by nothing is not worth running', () => {
    // Static dependency analysis would run this test on every stylesheet edit. The model has
    // seen it never break, and should rank it below a test that does.
    const index = buildIndex(syntheticHistory({ runs: 60 }));
    const innocent = extractFeatures(
      index,
      SYNTHETIC.innocentUiTest.testId,
      SYNTHETIC.innocentUiTest.file,
      ['src/auth.ts'],
    );
    const guilty = extractFeatures(index, SYNTHETIC.authTest.testId, SYNTHETIC.authTest.file, [
      'src/auth.ts',
    ]);

    expect(score(trained.weights, innocent)).toBeLessThan(score(trained.weights, guilty));
  });

  it('catches most of the failures it is shown', () => {
    expect(trained.metrics.recall).toBeGreaterThan(0.6);
    expect(trained.metrics.precision).toBeGreaterThan(0.6);
  });

  it('is measured on runs it never trained on', () => {
    const full = buildTrainingSet(syntheticHistory({ runs: 60 }));
    expect(trained.trainingSetSize).toBeLessThan(full.rows.length);
  });

  it('is deterministic for the same history', () => {
    const again = trainModel(buildTrainingSet(syntheticHistory({ runs: 60 })));
    expect(again.weights).toEqual(trained.weights);
  });
});

describe('score', () => {
  it('returns a probability', () => {
    expect(score([0], [1])).toBe(0.5);
    expect(score([10], [1])).toBeGreaterThan(0.99);
    expect(score([-10], [1])).toBeLessThan(0.01);
  });

  it('is bounded even for extreme inputs', () => {
    expect(score([1000], [1000])).toBeLessThanOrEqual(1);
    expect(score([-1000], [1000])).toBeGreaterThanOrEqual(0);
  });
});

describe('measure', () => {
  it('counts every quadrant of the confusion matrix', () => {
    // A single weight on a single feature, so the predictions are obvious by inspection.
    const metrics = measure([1], [[10], [10], [-10], [-10]], [1, 0, 1, 0]);
    expect(metrics.confusion).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      trueNegatives: 1,
    });
    expect(metrics.precision).toBe(0.5);
    expect(metrics.recall).toBe(0.5);
    expect(metrics.f1).toBe(0.5);
  });

  it('reports zero rather than NaN when nothing is predicted to fail', () => {
    const metrics = measure([-10], [[1], [1]], [1, 0]);
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
  });

  it('is perfect when every prediction is right', () => {
    const metrics = measure([1], [[10], [-10]], [1, 0]);
    expect(metrics.f1).toBe(1);
  });
});
