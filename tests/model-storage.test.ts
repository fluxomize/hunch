import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidModelError, readModel, writeModel } from '../src/storage/model.js';
import type { HunchModel } from '../src/types.js';

const model = (overrides: Partial<HunchModel> = {}): HunchModel => ({
  schemaVersion: 1,
  algorithm: 'logistic-regression',
  featureNames: ['bias', 'failureRate'],
  weights: [-1.2, 3.4],
  trainedAt: '2026-09-17T00:00:00.000Z',
  trainingSetSize: 150,
  metrics: {
    precision: 0.8,
    recall: 0.6,
    f1: 0.686,
    confusion: { truePositives: 8, falsePositives: 2, trueNegatives: 30, falseNegatives: 5 },
  },
  ...overrides,
});

describe('model file', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hunch-model-'));
    file = join(dir, '.hunch', 'model.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round trips', () => {
    writeModel(file, model());
    expect(readModel(file)).toEqual(model());
  });

  it('creates the directory on the first training', () => {
    writeModel(file, model());
    expect(readModel(file)).not.toBeNull();
  });

  it('is written for a person to read', () => {
    // Someone whose model makes a strange choice should be able to open this file and argue
    // with it, so it is indented rather than minified.
    writeModel(file, model());
    const raw = readFileSync(file, 'utf8');
    expect(raw).toContain('\n  "featureNames"');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('returns null when no model has been trained yet', () => {
    // Not an error: this is the normal state of a fresh repository.
    expect(readModel(join(dir, 'missing.json'))).toBeNull();
  });

  it('refuses a file that is not JSON', () => {
    writeModel(file, model());
    writeFileSync(file, 'not json', 'utf8');
    expect(() => readModel(file)).toThrow(InvalidModelError);
  });

  it('refuses a model from a schema it does not read', () => {
    // Silently ignoring it would make Hunch look like it was predicting when it was not.
    writeModel(file, { ...model(), schemaVersion: 99 } as unknown as HunchModel);
    expect(() => readModel(file)).toThrow(/schema 99/);
  });

  it('refuses a model whose weights do not line up with its features', () => {
    writeModel(file, model({ weights: [1] }));
    expect(() => readModel(file)).toThrow(/2 feature names but 1 weights/);
  });

  it('refuses a model missing its weights entirely', () => {
    writeModel(file, model());
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, featureNames: [] }), 'utf8');
    expect(() => readModel(file)).toThrow(/missing its features or weights/);
  });

  it('refuses a file that parses to something that is not an object', () => {
    writeModel(file, model());
    writeFileSync(file, '42', 'utf8');
    expect(() => readModel(file)).toThrow(/does not contain a model/);
  });
});
