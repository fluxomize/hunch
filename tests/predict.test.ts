import { describe, expect, it } from 'vitest';
import { buildIndex, buildTrainingSet, createIndex } from '../src/model/features.js';
import { estimateSkippedDuration, predict, selectTests } from '../src/model/predict.js';
import { trainModel } from '../src/model/train.js';
import type { Prediction } from '../src/types.js';
import { SYNTHETIC, syntheticHistory } from './support/synthetic.js';

const history = syntheticHistory({ runs: 60 });
const index = buildIndex(history);
const model = trainModel(buildTrainingSet(history));

const candidates = [
  { testId: SYNTHETIC.authTest.testId, file: SYNTHETIC.authTest.file },
  { testId: SYNTHETIC.cartTest.testId, file: SYNTHETIC.cartTest.file },
  { testId: SYNTHETIC.innocentUiTest.testId, file: SYNTHETIC.innocentUiTest.file },
  { testId: SYNTHETIC.flakyTest.testId, file: SYNTHETIC.flakyTest.file },
  { testId: 'tests/smoke.spec.ts > loads the page', file: 'tests/smoke.spec.ts' },
];

describe('predict', () => {
  it('scores every candidate', () => {
    const predictions = predict(model, index, candidates, ['src/auth.ts']);
    expect(predictions).toHaveLength(candidates.length);
    expect(predictions.every((p) => p.score >= 0 && p.score <= 1)).toBe(true);
  });

  it('returns the riskiest test first', () => {
    const predictions = predict(model, index, candidates, ['src/auth.ts']);
    const scores = predictions.map((p) => p.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('puts the test that breaks with this change at the top', () => {
    const predictions = predict(model, index, candidates, ['src/auth.ts']);
    expect(predictions[0]?.testId).toBe(SYNTHETIC.authTest.testId);
  });

  it('changes its mind when a different file changes', () => {
    // The same suite, a different diff, a different answer. If this ever stops holding, the
    // model is ignoring the change set and is just ranking flaky tests.
    const forAuth = predict(model, index, candidates, ['src/auth.ts']);
    const forCart = predict(model, index, candidates, ['src/cart.ts']);
    expect(forAuth[0]?.testId).not.toBe(forCart[0]?.testId);
    expect(forCart[0]?.testId).toBe(SYNTHETIC.cartTest.testId);
  });
});

describe('selectTests', () => {
  const predictions = (...entries: [string, number][]): Prediction[] =>
    entries.map(([testId, score]) => ({ testId, score }));

  it('takes the highest scoring share of the suite', () => {
    const known = buildIndex(syntheticHistory({ runs: 10 }));
    const scored = predict(model, known, candidates, ['src/auth.ts']);
    const selection = selectTests(scored, known, { ratio: 0.4, minTests: 1 });

    expect(selection.selected).toHaveLength(2);
    expect(selection.selected).toContain(SYNTHETIC.authTest.testId);
    expect(selection.skipped).toHaveLength(3);
  });

  it('always runs a test it has never seen', () => {
    // The rule that keeps this tool from silently dropping everything added this week.
    const empty = createIndex();
    const selection = selectTests(predictions(['brand-new', 0.01], ['also-new', 0.01]), empty, {
      ratio: 0,
      minTests: 0,
    });

    expect(selection.selected.sort()).toEqual(['also-new', 'brand-new']);
    expect(selection.unknown.sort()).toEqual(['also-new', 'brand-new']);
    expect(selection.skipped).toEqual([]);
  });

  it('counts unknown tests towards the target rather than adding to it', () => {
    const known = buildIndex(syntheticHistory({ runs: 10 }));
    const scored = [
      ...predict(model, known, candidates, ['src/auth.ts']),
      { testId: 'tests/new.spec.ts > brand new', score: 0 },
    ];
    const selection = selectTests(scored, known, { ratio: 0.5, minTests: 0 });

    expect(selection.selected).toHaveLength(3);
    expect(selection.selected).toContain('tests/new.spec.ts > brand new');
  });

  it('honours the floor on a small suite', () => {
    // 30% of five tests is one test, which is not selection, it is a coin toss.
    const known = buildIndex(syntheticHistory({ runs: 10 }));
    const scored = predict(model, known, candidates, ['src/auth.ts']);
    const selection = selectTests(scored, known, { ratio: 0.3, minTests: 4 });
    expect(selection.selected).toHaveLength(4);
  });

  it('never selects more tests than exist', () => {
    const known = buildIndex(syntheticHistory({ runs: 10 }));
    const scored = predict(model, known, candidates, ['src/auth.ts']);
    const selection = selectTests(scored, known, { ratio: 1, minTests: 999 });
    expect(selection.selected).toHaveLength(candidates.length);
    expect(selection.skipped).toEqual([]);
  });

  it('treats a nonsense ratio as zero rather than crashing', () => {
    const known = buildIndex(syntheticHistory({ runs: 10 }));
    const scored = predict(model, known, candidates, ['src/auth.ts']);
    expect(selectTests(scored, known, { ratio: Number.NaN, minTests: 0 }).selected).toEqual([]);
    expect(selectTests(scored, known, { ratio: -1, minTests: 0 }).selected).toEqual([]);
  });

  it('keeps selected and skipped disjoint and complete', () => {
    const known = buildIndex(syntheticHistory({ runs: 10 }));
    const scored = predict(model, known, candidates, ['src/auth.ts']);
    const selection = selectTests(scored, known, { ratio: 0.5, minTests: 1 });

    expect([...selection.selected, ...selection.skipped].sort()).toEqual(
      candidates.map((c) => c.testId).sort(),
    );
  });
});

describe('estimateSkippedDuration', () => {
  it('adds up each test by its own historical mean', () => {
    const total = estimateSkippedDuration(index, [
      SYNTHETIC.authTest.testId,
      SYNTHETIC.cartTest.testId,
    ]);
    expect(total).toBeGreaterThan(0);
  });

  it('contributes nothing for a test with no history', () => {
    // Understating the saving is the right direction to be wrong in for a number this project
    // puts in its marketing.
    expect(estimateSkippedDuration(index, ['never-seen'])).toBe(0);
  });

  it('is zero when nothing was skipped', () => {
    expect(estimateSkippedDuration(index, [])).toBe(0);
  });
});
