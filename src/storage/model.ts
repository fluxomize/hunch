import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HunchModel } from '../types.js';

/**
 * Reading and writing `.hunch/model.json`.
 *
 * Unlike the history, the model is rewritten in full every time it is trained, and it is meant
 * to be read by a person: it is pretty printed, and every weight sits next to the name of the
 * feature it belongs to. If the model starts making strange choices, the file is where you go
 * to find out why.
 */

/** The model file has a version of its own, so an older Hunch refuses rather than misreads. */
export const MODEL_SCHEMA_VERSION = 1;

/** Raised when a model file exists but cannot be used. */
export class InvalidModelError extends Error {}

/** Writes the model, creating the directory if this is the first training. */
export function writeModel(filePath: string, model: HunchModel): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(model, null, 2) + '\n', 'utf8');
}

/**
 * Reads the model, or returns null when there is not one yet.
 *
 * A missing model is an ordinary state, so it is not an error. A model that exists but is
 * damaged or from another schema version is an error, because silently ignoring it would make
 * Hunch look like it was predicting when it was not.
 */
export function readModel(filePath: string): HunchModel | null {
  let contents: string;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new InvalidModelError(`${filePath} is not valid JSON. Delete it and train again.`);
  }

  return validate(parsed, filePath);
}

/** Checks the fields prediction depends on, and that the file was written by this version. */
function validate(value: unknown, filePath: string): HunchModel {
  if (typeof value !== 'object' || value === null) {
    throw new InvalidModelError(`${filePath} does not contain a model. Train again.`);
  }
  const model = value as Record<string, unknown>;

  if (model['schemaVersion'] !== MODEL_SCHEMA_VERSION) {
    throw new InvalidModelError(
      `${filePath} was written for model schema ${String(model['schemaVersion'])}, ` +
        `and this version of Hunch reads ${MODEL_SCHEMA_VERSION}. Train again.`,
    );
  }

  const names = model['featureNames'];
  const weights = model['weights'];
  if (!Array.isArray(names) || !Array.isArray(weights)) {
    throw new InvalidModelError(`${filePath} is missing its features or weights. Train again.`);
  }
  if (names.length !== weights.length) {
    throw new InvalidModelError(
      `${filePath} has ${names.length} feature names but ${weights.length} weights. Train again.`,
    );
  }

  return model as unknown as HunchModel;
}
