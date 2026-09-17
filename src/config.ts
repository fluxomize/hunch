import type { HunchConfig } from './types.js';

/** Directory, relative to the repository root, where Hunch keeps everything it writes. */
export const HUNCH_DIR = '.hunch';

/** Name of the append only history file inside {@link HUNCH_DIR}. */
export const HISTORY_FILE = 'history.jsonl';

/** Name of the trained model file inside {@link HUNCH_DIR}. */
export const MODEL_FILE = 'model.json';

/**
 * Average power draw of a test runner, in watts.
 *
 * 65 W is a rough figure for a GitHub Actions hosted runner under load. It is an assumption,
 * not a measurement, and users running on their own hardware should override it.
 */
export const DEFAULT_RUNNER_WATTS = 65;

/**
 * Carbon intensity of electricity, in grams of CO₂ equivalent per kWh.
 *
 * 475 gCO₂eq/kWh is a commonly cited global average and the safe default for public cloud
 * runners, whose location you usually do not control. For self hosted runners in Brazil the
 * grid factor published by the ONS is closer to 85 gCO₂eq/kWh.
 */
export const DEFAULT_GRID_INTENSITY = 475;

/** Defaults applied when the user configures nothing. */
export const DEFAULT_CONFIG: HunchConfig = {
  outputDir: HUNCH_DIR,
  selectionRatio: 0.3,
  minTests: 5,
  minRunsToTrain: 20,
  sustainability: {
    runnerWatts: DEFAULT_RUNNER_WATTS,
    gridIntensity: DEFAULT_GRID_INTENSITY,
  },
};
