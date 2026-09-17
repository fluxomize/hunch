/**
 * Public API of `@fluxomize/hunch`.
 *
 * The Playwright reporter is published separately under `@fluxomize/hunch/reporter`, because
 * Playwright loads reporters by module path and expects a default export.
 */

export type {
  FeatureVector,
  HunchConfig,
  HunchModel,
  ModelMetrics,
  Prediction,
  ReporterOptions,
  RunSummary,
  SustainabilityConfig,
  TestRecord,
  TestStatus,
} from './types.js';

export {
  DEFAULT_CONFIG,
  DEFAULT_GRID_INTENSITY,
  DEFAULT_RUNNER_WATTS,
  HISTORY_FILE,
  HUNCH_DIR,
  MODEL_FILE,
} from './config.js';

export {
  getBranch,
  getChangedFiles,
  getCommitSha,
  getUncommittedFiles,
  isGitRepository,
} from './git/index.js';

export { appendRecords, readRecords } from './storage/jsonl.js';

export { buildTestId, Collector, toRecord } from './reporter/collector.js';
export type { FinishedTest, RunContext } from './reporter/collector.js';

export { InvalidModelError, readModel, writeModel } from './storage/model.js';

export {
  FEATURE_NAMES,
  advanceIndex,
  buildIndex,
  buildTrainingSet,
  createIndex,
  extractFeatures,
  groupIntoRuns,
} from './model/features.js';
export type { HistoryIndex, Run, TestOutcome, TrainingSet } from './model/features.js';

export { NotEnoughSignalError, measure, score, trainModel } from './model/train.js';
