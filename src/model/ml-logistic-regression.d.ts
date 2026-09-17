/**
 * Types for `ml-logistic-regression`, which ships none.
 *
 * Only the surface Hunch actually touches is declared. Anything beyond this is deliberately
 * left undescribed rather than guessed at.
 */
declare module 'ml-logistic-regression' {
  import type { Matrix } from 'ml-matrix';

  /** One binary classifier fitted by the one versus all loop. */
  interface TwoClassClassifier {
    /** Learned weights as a one row matrix, with no intercept among them. */
    weights: Matrix;
  }

  interface LogisticRegressionOptions {
    /** Gradient descent iterations. */
    numSteps?: number;
    /**
     * Step size. The library's gradient is a sum over examples rather than a mean, so callers
     * are expected to scale this by the size of their dataset.
     */
    learningRate?: number;
  }

  export default class LogisticRegression {
    constructor(options?: LogisticRegressionOptions);
    /** One classifier per class. For two classes, the first predicts label 1. */
    classifiers: TwoClassClassifier[];
    numberClasses: number;
    train(features: Matrix, target: Matrix): void;
    predict(features: Matrix): number[];
  }
}
