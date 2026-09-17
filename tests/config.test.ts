import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, HISTORY_FILE, HUNCH_DIR, MODEL_FILE } from '../src/config.js';

describe('default configuration', () => {
  it('keeps every artefact inside a single hidden directory', () => {
    expect(HUNCH_DIR).toBe('.hunch');
    expect(HISTORY_FILE).toBe('history.jsonl');
    expect(MODEL_FILE).toBe('model.json');
    expect(DEFAULT_CONFIG.outputDir).toBe(HUNCH_DIR);
  });

  it('selects a fraction of the suite, not all of it and not none of it', () => {
    expect(DEFAULT_CONFIG.selectionRatio).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.selectionRatio).toBeLessThan(1);
  });

  it('keeps a floor on the number of selected tests', () => {
    expect(DEFAULT_CONFIG.minTests).toBeGreaterThan(0);
  });

  it('refuses to train on a handful of runs', () => {
    expect(DEFAULT_CONFIG.minRunsToTrain).toBeGreaterThanOrEqual(20);
  });

  it('ships plausible sustainability defaults', () => {
    expect(DEFAULT_CONFIG.sustainability.runnerWatts).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.sustainability.gridIntensity).toBeGreaterThan(0);
  });
});
