import { DEFAULT_RUNNER_WATTS } from '../config.js';

/**
 * Estimating the electricity a test run costs.
 *
 * This is an estimate and the documentation says so everywhere it appears. Hunch cannot read a
 * power meter; what it can do is apply an arithmetic anybody can check, with the one assumption
 * it makes stated as a number the user can change.
 *
 *     kWh = hours × watts ÷ 1000
 *
 * That is the whole model. It ignores idle draw, cooling, the power used by the machine that
 * scheduled the job, and the manufacturing cost of the hardware, so the true figure is higher
 * than what Hunch reports. Reporting the smaller, defensible number is the honest direction to
 * be wrong in.
 */

/** Milliseconds in an hour. */
const MS_PER_HOUR = 3_600_000;

/**
 * Energy used by a machine drawing `watts` for `durationMs`, in kilowatt hours.
 *
 * @param durationMs how long the work took, in milliseconds
 * @param watts average power draw of the machine; defaults to a GitHub hosted runner
 */
export function estimateKWh(durationMs: number, watts: number = DEFAULT_RUNNER_WATTS): number {
  if (durationMs <= 0 || watts <= 0) {
    return 0;
  }
  return (durationMs / MS_PER_HOUR) * (watts / 1000);
}
