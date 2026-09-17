import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import {
  CONFIG_FILE,
  InvalidConfigError,
  readUserConfig,
  resolveConfig,
} from '../src/user-config.js';

describe('hunch.config.json', () => {
  let repo: string;

  const write = (contents: unknown): void => {
    writeFileSync(
      join(repo, CONFIG_FILE),
      typeof contents === 'string' ? contents : JSON.stringify(contents),
      'utf8',
    );
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'hunch-config-'));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('is optional', () => {
    expect(readUserConfig(repo)).toEqual({});
    expect(resolveConfig(repo)).toEqual({
      selectionRatio: DEFAULT_CONFIG.selectionRatio,
      minTests: DEFAULT_CONFIG.minTests,
      minRunsToTrain: DEFAULT_CONFIG.minRunsToTrain,
      sustainability: DEFAULT_CONFIG.sustainability,
    });
  });

  it('reads the settings a user is most likely to change', () => {
    // The README calls the sustainability numbers assumptions the user can replace. This is
    // the mechanism that makes that true rather than a claim.
    write({ sustainability: { runnerWatts: 15, gridIntensity: 85 } });
    expect(resolveConfig(repo).sustainability).toEqual({ runnerWatts: 15, gridIntensity: 85 });
  });

  it('leaves unset values at their defaults', () => {
    write({ sustainability: { gridIntensity: 85 } });
    expect(resolveConfig(repo).sustainability).toEqual({
      runnerWatts: DEFAULT_CONFIG.sustainability.runnerWatts,
      gridIntensity: 85,
    });
  });

  it('reads the selection settings', () => {
    write({ selectionRatio: 0.5, minTests: 20, minRunsToTrain: 40 });
    expect(resolveConfig(repo)).toMatchObject({
      selectionRatio: 0.5,
      minTests: 20,
      minRunsToTrain: 40,
    });
  });

  it('lets a command line flag beat the file', () => {
    // Increasing order of deliberateness: a flag typed for this run beats a file written last
    // month, and both beat a default chosen by somebody who has never seen the hardware.
    write({ selectionRatio: 0.5, sustainability: { runnerWatts: 15 } });
    const resolved = resolveConfig(repo, { selectionRatio: 0.9, runnerWatts: 200 });
    expect(resolved.selectionRatio).toBe(0.9);
    expect(resolved.sustainability.runnerWatts).toBe(200);
  });

  it('ignores an override that was not given', () => {
    write({ selectionRatio: 0.5 });
    expect(resolveConfig(repo, { selectionRatio: undefined }).selectionRatio).toBe(0.5);
  });

  it('refuses a file that is not JSON', () => {
    // Falling back to defaults here would report savings against assumptions the user believed
    // they had replaced, which is worse than refusing.
    write('{ not json');
    expect(() => readUserConfig(repo)).toThrow(InvalidConfigError);
  });

  it('refuses a file that is not an object', () => {
    write([1, 2, 3]);
    expect(() => readUserConfig(repo)).toThrow(/must contain a JSON object/);
  });

  it('refuses a setting that is not a number', () => {
    write({ minTests: 'lots' });
    expect(() => readUserConfig(repo)).toThrow(/"minTests" must be a number/);
  });

  it('refuses a negative setting', () => {
    write({ sustainability: { runnerWatts: -65 } });
    expect(() => readUserConfig(repo)).toThrow(/"runnerWatts" must be a number/);
  });

  it('refuses a sustainability block that is not an object', () => {
    write({ sustainability: 65 });
    expect(() => readUserConfig(repo)).toThrow(/"sustainability" must be an object/);
  });

  it('names the file in every complaint, so the user knows what to open', () => {
    write({ minTests: null });
    expect(() => readUserConfig(repo)).toThrow(new RegExp(CONFIG_FILE.replace('.', '\\.')));
  });
});
