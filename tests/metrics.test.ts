import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID_INTENSITY, DEFAULT_RUNNER_WATTS } from '../src/config.js';
import { estimateKWh } from '../src/metrics/energy.js';
import { estimateCo2Grams, estimateSavings } from '../src/metrics/carbon.js';
import {
  formatCarbon,
  formatDuration,
  formatEnergy,
  formatSavings,
} from '../src/metrics/format.js';

describe('energy', () => {
  it('follows the documented formula', () => {
    // One hour at 1000 W is one kilowatt hour, by definition. If this ever fails, the formula
    // in the README is wrong too.
    expect(estimateKWh(3_600_000, 1000)).toBeCloseTo(1, 10);
  });

  it('scales with time', () => {
    expect(estimateKWh(1_800_000, 1000)).toBeCloseTo(0.5, 10);
  });

  it('scales with power draw', () => {
    expect(estimateKWh(3_600_000, 65)).toBeCloseTo(0.065, 10);
  });

  it('uses the runner default when no power draw is given', () => {
    expect(estimateKWh(3_600_000)).toBeCloseTo(DEFAULT_RUNNER_WATTS / 1000, 10);
  });

  it('is zero rather than negative for nonsense inputs', () => {
    expect(estimateKWh(-1000, 65)).toBe(0);
    expect(estimateKWh(1000, -65)).toBe(0);
    expect(estimateKWh(0, 65)).toBe(0);
  });
});

describe('carbon', () => {
  it('multiplies energy by the grid factor', () => {
    expect(estimateCo2Grams(1, 475)).toBe(475);
  });

  it('uses the global average when no grid factor is given', () => {
    expect(estimateCo2Grams(1)).toBe(DEFAULT_GRID_INTENSITY);
  });

  it('reflects a cleaner grid', () => {
    // A mostly hydroelectric grid really is about a fifth of the global average, which is why
    // this is a setting rather than a constant.
    expect(estimateCo2Grams(1, 85)).toBeLessThan(estimateCo2Grams(1, 475));
  });

  it('is zero rather than negative for nonsense inputs', () => {
    expect(estimateCo2Grams(-1, 475)).toBe(0);
    expect(estimateCo2Grams(1, -475)).toBe(0);
  });
});

describe('savings', () => {
  it('reports the same duration in three units', () => {
    const saved = estimateSavings(3_600_000, { runnerWatts: 1000, gridIntensity: 475 });
    expect(saved.seconds).toBe(3600);
    expect(saved.kWh).toBeCloseTo(1, 10);
    expect(saved.gCo2eq).toBeCloseTo(475, 10);
  });

  it('never reports a negative saving', () => {
    const saved = estimateSavings(-5000);
    expect(saved.seconds).toBe(0);
    expect(saved.kWh).toBe(0);
    expect(saved.gCo2eq).toBe(0);
  });

  it('uses the documented defaults when given none', () => {
    const saved = estimateSavings(3_600_000);
    expect(saved.kWh).toBeCloseTo(DEFAULT_RUNNER_WATTS / 1000, 10);
  });
});

describe('formatting savings at any scale', () => {
  it('writes a fast suite in milliseconds rather than as 0.0s', () => {
    // A real saving printed as "0.0s" reads as a broken feature, and this is the number the
    // project makes its case with.
    expect(formatDuration(15)).toBe('15ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('writes seconds and minutes as a person would say them', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(59_000)).toBe('59.0s');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(120_000)).toBe('2m');
  });

  it('picks the multiple of a watt hour that keeps the number readable', () => {
    expect(formatEnergy(0.0000005)).toBe('500.00 µWh');
    expect(formatEnergy(0.0001)).toBe('100.00 mWh');
    expect(formatEnergy(0.05)).toBe('50.00 Wh');
    expect(formatEnergy(5)).toBe('5.000 kWh');
  });

  it('picks the multiple of a gram that keeps the number readable', () => {
    expect(formatCarbon(0.0000005)).toBe('0.50 µgCO2eq');
    expect(formatCarbon(0.5)).toBe('500.00 mgCO2eq');
    expect(formatCarbon(50)).toBe('50.00 gCO2eq');
    expect(formatCarbon(5000)).toBe('5.000 kgCO2eq');
  });

  it('never prints a saving as zero when there was one', () => {
    const saved = estimateSavings(15);
    expect(formatSavings(saved)).not.toMatch(/\b0\.00\b.*\b0\.00\b/);
    expect(formatSavings(saved)).toContain('15ms');
  });
});
