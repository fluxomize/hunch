import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from './config.js';
import type { HunchConfig } from './types.js';

/**
 * Reading `hunch.config.json`.
 *
 * The sustainability numbers are assumptions, not facts, and the documentation says so. That
 * only means anything if a user can actually change them, which is what this file is for. It
 * sits at the top of the repository next to `playwright.config.ts`, where somebody would look
 * for it.
 *
 * JSON rather than JavaScript on purpose: config that can execute is config that has to be
 * bundled, sandboxed and trusted, and none of these settings need a computation.
 */

/** Name of the configuration file, at the top of the working tree. */
export const CONFIG_FILE = 'hunch.config.json';

/** Raised when the file exists but cannot be used. */
export class InvalidConfigError extends Error {}

/** Everything a user may set. Anything omitted keeps its default. */
export interface UserConfig {
  selectionRatio?: number;
  minTests?: number;
  minRunsToTrain?: number;
  sustainability?: {
    runnerWatts?: number;
    gridIntensity?: number;
  };
}

/**
 * Reads the config file, or returns nothing when there is not one.
 *
 * A missing file is the normal case. A malformed one is an error, because silently falling
 * back to defaults would report savings against assumptions the user believed they had
 * replaced.
 */
export function readUserConfig(repoRoot: string): UserConfig {
  const path = join(repoRoot, CONFIG_FILE);
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new InvalidConfigError(`${path} is not valid JSON.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidConfigError(`${path} must contain a JSON object.`);
  }

  const config = parsed as Record<string, unknown>;
  const sustainability = config['sustainability'];

  return {
    ...pickNumber(config, 'selectionRatio', path),
    ...pickNumber(config, 'minTests', path),
    ...pickNumber(config, 'minRunsToTrain', path),
    ...(sustainability !== undefined
      ? { sustainability: readSustainability(sustainability, path) }
      : {}),
  };
}

/** Reads the sustainability block, rejecting values that cannot describe a real machine. */
function readSustainability(
  value: unknown,
  path: string,
): NonNullable<UserConfig['sustainability']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidConfigError(`${path}: "sustainability" must be an object.`);
  }
  const block = value as Record<string, unknown>;
  return {
    ...pickNumber(block, 'runnerWatts', path),
    ...pickNumber(block, 'gridIntensity', path),
  };
}

/** Reads one optional number, refusing anything that is not a usable one. */
function pickNumber<K extends string>(
  source: Record<string, unknown>,
  key: K,
  path: string,
): Partial<Record<K, number>> {
  const value = source[key];
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new InvalidConfigError(`${path}: "${key}" must be a number of zero or more.`);
  }
  return { [key]: value } as Record<K, number>;
}

/** Values a command line flag can override, after the file has been read. */
export interface ConfigOverrides {
  selectionRatio?: number | undefined;
  minTests?: number | undefined;
  minRunsToTrain?: number | undefined;
  runnerWatts?: number | undefined;
  gridIntensity?: number | undefined;
}

/**
 * Settles the configuration: defaults, then the file, then the command line.
 *
 * Later wins, which is the order of increasing deliberateness. A flag somebody typed for this
 * one run should beat a file they wrote last month, and both should beat a default chosen by
 * somebody who has never seen their hardware.
 */
export function resolveConfig(
  repoRoot: string,
  overrides: ConfigOverrides = {},
): Omit<HunchConfig, 'outputDir'> {
  const file = readUserConfig(repoRoot);

  return {
    selectionRatio:
      overrides.selectionRatio ?? file.selectionRatio ?? DEFAULT_CONFIG.selectionRatio,
    minTests: overrides.minTests ?? file.minTests ?? DEFAULT_CONFIG.minTests,
    minRunsToTrain:
      overrides.minRunsToTrain ?? file.minRunsToTrain ?? DEFAULT_CONFIG.minRunsToTrain,
    sustainability: {
      runnerWatts:
        overrides.runnerWatts ??
        file.sustainability?.runnerWatts ??
        DEFAULT_CONFIG.sustainability.runnerWatts,
      gridIntensity:
        overrides.gridIntensity ??
        file.sustainability?.gridIntensity ??
        DEFAULT_CONFIG.sustainability.gridIntensity,
    },
  };
}
