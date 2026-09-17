import { DEFAULT_GRID_INTENSITY, DEFAULT_CONFIG } from '../config.js';
import type { SustainabilityConfig } from '../types.js';
import { estimateKWh } from './energy.js';

/**
 * Turning kilowatt hours into grams of CO₂ equivalent.
 *
 * Carbon intensity varies by grid, by country and by hour of the day, and public cloud runners
 * do not tell you where they are. The default is a commonly cited global average, which is the
 * right shape of guess when the location is unknown; anyone running on their own hardware knows
 * better than this default and should say so.
 *
 * For reference, self hosted runners in Brazil sit near 85 gCO₂eq/kWh because the grid is
 * mostly hydroelectric, which is roughly a fifth of the global average. The same test suite is
 * genuinely cleaner there. Hunch has no way to know that on its own, which is exactly why the
 * number is a setting and not a constant.
 */

/** Emissions from a quantity of electricity, in grams of CO₂ equivalent. */
export function estimateCo2Grams(
  kWh: number,
  gridIntensity: number = DEFAULT_GRID_INTENSITY,
): number {
  if (kWh <= 0 || gridIntensity <= 0) {
    return 0;
  }
  return kWh * gridIntensity;
}

/** What a stretch of machine time cost, in the three units the summary reports. */
export interface Savings {
  seconds: number;
  kWh: number;
  gCo2eq: number;
}

/** Converts a duration into time, energy and carbon in one step. */
export function estimateSavings(
  durationMs: number,
  sustainability: SustainabilityConfig = DEFAULT_CONFIG.sustainability,
): Savings {
  const kWh = estimateKWh(durationMs, sustainability.runnerWatts);
  return {
    seconds: Math.max(durationMs, 0) / 1000,
    kWh,
    gCo2eq: estimateCo2Grams(kWh, sustainability.gridIntensity),
  };
}
