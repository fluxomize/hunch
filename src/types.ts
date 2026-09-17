/**
 * Core types for Hunch.
 *
 * This module is the contract between the four moving parts of the project: the Playwright
 * reporter that collects history, the feature engineering that turns history into vectors, the
 * model that learns from those vectors, and the runner that acts on the predictions.
 *
 * Everything here is data that ends up on disk inside the user's repository, so treat these
 * shapes as a file format: changing one is a breaking change and needs a changelog entry.
 */

/** Outcome of a single test in a single run, mirroring Playwright's own statuses. */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'timedOut';

/**
 * One line of `.hunch/history.jsonl`: a single test, in a single run.
 *
 * The file is append only and newline delimited so that it stays diffable, greppable and
 * auditable by a human, and so that two runs can never corrupt each other's records.
 */
export interface TestRecord {
  /**
   * Stable identifier for a test across runs, built from its file path, its describe blocks
   * and its title. Renaming a test starts a new history for it, which is intentional.
   */
  testId: string;
  /** Test file path, relative to the repository root, with forward slashes. */
  file: string;
  /** Name of the Playwright project the test ran under, for example `chromium`. */
  project: string;
  /** Wall clock duration of the test, in milliseconds. */
  duration: number;
  /** How the test ended. */
  status: TestStatus;
  /** When the test finished, as an ISO 8601 timestamp. */
  timestamp: string;
  /** Full SHA of the commit the run was executed against. */
  commitSha: string;
  /**
   * Files changed in the commit or commit range under test, relative to the repository root.
   * This is the signal the model learns to associate with failures.
   */
  changedFiles: string[];
  /** Branch the run happened on, when it can be determined. */
  branch: string;
  /**
   * Attempt number, 0 for the first try.
   *
   * Every attempt is recorded, not just the final one, because a test that fails and then
   * passes on retry is the definition of flaky, and learning to recognise flakiness is one of
   * the things Hunch is for. Optional so that records written before this field existed still
   * read cleanly.
   */
  retry?: number;
}

/** Options accepted by the Playwright reporter in `playwright.config.ts`. */
export interface ReporterOptions {
  /** Directory where Hunch keeps its data. Defaults to `.hunch`. */
  outputDir?: string;
  /** Print what the reporter is doing. Off by default, so normal runs stay quiet. */
  verbose?: boolean;
  /**
   * Git revision range used to compute `changedFiles`. Defaults to `HEAD~1..HEAD` locally;
   * on CI you usually want the range of the pull request instead.
   */
  diffRange?: string;
}

/** A single named input to the model, for one test and one candidate change set. */
export interface FeatureVector {
  /** The test these features describe. */
  testId: string;
  /** Feature values, in the order declared by the model's `featureNames`. */
  values: number[];
}

/** A trained model, as persisted to `.hunch/model.json`. */
export interface HunchModel {
  /** Schema version of the model file, so older files can be rejected or migrated. */
  schemaVersion: 1;
  /** Which algorithm produced this model. Only logistic regression exists in v0.1. */
  algorithm: 'logistic-regression';
  /** Names of the features, in the same order as every `FeatureVector.values`. */
  featureNames: string[];
  /** Learned weights, one per feature, plus the intercept. */
  weights: number[];
  /** Intercept term of the regression. */
  intercept: number;
  /** When the model was trained, as an ISO 8601 timestamp. */
  trainedAt: string;
  /** How many records from the history file went into training. */
  trainingSetSize: number;
  /** Quality of the model on held out data, reported to the user after training. */
  metrics: ModelMetrics;
}

/** Quality report produced by `hunch train`. */
export interface ModelMetrics {
  precision: number;
  recall: number;
  f1: number;
  /** Confusion matrix on the evaluation split. */
  confusion: {
    truePositives: number;
    falsePositives: number;
    trueNegatives: number;
    falseNegatives: number;
  };
}

/** A test with the model's estimate of how likely it is to fail for the current change set. */
export interface Prediction {
  testId: string;
  /** Probability of failure, between 0 and 1. */
  score: number;
}

/** Everything `hunch run` reports once the selected tests have finished. */
export interface RunSummary {
  /** How many tests the model selected. */
  selectedCount: number;
  /** How many tests exist in the suite. */
  totalCount: number;
  /** Estimated seconds saved by not running the rest, from their historical mean duration. */
  secondsSaved: number;
  /** Estimated energy not consumed, in kilowatt hours. */
  kWhSaved: number;
  /** Estimated emissions avoided, in grams of CO₂ equivalent. */
  gCo2eqSaved: number;
}

/** Inputs to the energy and carbon estimates, all of them user configurable. */
export interface SustainabilityConfig {
  /**
   * Average power draw of the machine running the tests, in watts. Defaults to 65 W, which is
   * a reasonable figure for a GitHub Actions hosted runner.
   */
  runnerWatts: number;
  /**
   * Carbon intensity of the electricity the runner uses, in grams of CO₂ equivalent per kWh.
   * Defaults to a global average for public cloud; self hosted runners should set their own
   * grid's factor.
   */
  gridIntensity: number;
}

/** Full Hunch configuration, as resolved from defaults, config file and CLI flags. */
export interface HunchConfig {
  /** Directory where Hunch keeps its data. Defaults to `.hunch`. */
  outputDir: string;
  /** Fraction of the suite to run, between 0 and 1. Defaults to 0.3. */
  selectionRatio: number;
  /** Never select fewer than this many tests, whatever the ratio says. Defaults to 5. */
  minTests: number;
  /** Minimum number of historical runs required before training is worthwhile. */
  minRunsToTrain: number;
  /** Inputs to the sustainability estimates. */
  sustainability: SustainabilityConfig;
}
