import type { Savings } from './carbon.js';

/**
 * Presenting the savings at whatever scale they happen to be.
 *
 * A fast suite saves milliwatt hours and a slow one saves kilowatt hours, and a single fixed
 * format cannot show both. Printing "0.000000 kWh" for a real saving reads as a broken
 * feature, and this is the number the project makes its case with, so it has to stay legible
 * when it is small rather than only when it is impressive.
 */

/** A duration in milliseconds, written the way a person would say it. */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/** Energy in whichever multiple of a watt hour keeps the number readable. */
export function formatEnergy(kWh: number): string {
  const wh = kWh * 1000;
  if (wh < 0.001) {
    return `${(wh * 1_000_000).toFixed(2)} µWh`;
  }
  if (wh < 1) {
    return `${(wh * 1000).toFixed(2)} mWh`;
  }
  if (wh < 1000) {
    return `${wh.toFixed(2)} Wh`;
  }
  return `${kWh.toFixed(3)} kWh`;
}

/** Emissions in whichever multiple of a gram keeps the number readable. */
export function formatCarbon(grams: number): string {
  if (grams < 0.001) {
    return `${(grams * 1_000_000).toFixed(2)} µgCO2eq`;
  }
  if (grams < 1) {
    return `${(grams * 1000).toFixed(2)} mgCO2eq`;
  }
  if (grams < 1000) {
    return `${grams.toFixed(2)} gCO2eq`;
  }
  return `${(grams / 1000).toFixed(3)} kgCO2eq`;
}

/** The one line summary of what was not spent. */
export function formatSavings(saved: Savings): string {
  return `${formatDuration(saved.seconds * 1000)}, ${formatEnergy(saved.kWh)}, ${formatCarbon(saved.gCo2eq)}`;
}
