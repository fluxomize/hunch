import type { TestRecord } from '../../src/types.js';

/**
 * A history with a pattern somebody planted in it.
 *
 * Training on real data can only ever tell you the model produced *a* number. This generator
 * plants a correlation the model is supposed to find, so a test can assert it actually found
 * it: `tests/auth.spec.ts` almost always breaks when `src/auth.ts` changes and almost never
 * otherwise, while `tests/ui.spec.ts` is touched by the same changes and never breaks at all.
 *
 * That second test is the whole argument for this project. A dependency graph would run it
 * every time. The model should learn not to.
 */

/** A small deterministic generator, so a failing test fails the same way twice. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How one test behaves in the planted world. */
interface TestBehaviour {
  testId: string;
  file: string;
  /** Source files whose change makes this test likely to break. */
  triggeredBy: string[];
  /** Probability of failing when one of its triggers changed. */
  failWhenTriggered: number;
  /** Probability of failing otherwise. */
  failOtherwise: number;
}

const SOURCE_FILES = ['src/auth.ts', 'src/cart.ts', 'styles/main.css'];

const BEHAVIOURS: TestBehaviour[] = [
  {
    testId: 'tests/auth.spec.ts > auth > signs in',
    file: 'tests/auth.spec.ts',
    triggeredBy: ['src/auth.ts'],
    failWhenTriggered: 0.85,
    failOtherwise: 0.01,
  },
  {
    testId: 'tests/cart.spec.ts > cart > adds an item',
    file: 'tests/cart.spec.ts',
    triggeredBy: ['src/cart.ts'],
    failWhenTriggered: 0.75,
    failOtherwise: 0.01,
  },
  {
    // Changed by the same stylesheet edits that touch everything, and never actually broken.
    testId: 'tests/ui.spec.ts > ui > renders the header',
    file: 'tests/ui.spec.ts',
    triggeredBy: [],
    failWhenTriggered: 0,
    failOtherwise: 0,
  },
  {
    testId: 'tests/flaky.spec.ts > sometimes works',
    file: 'tests/flaky.spec.ts',
    triggeredBy: [],
    failWhenTriggered: 0.25,
    failOtherwise: 0.25,
  },
  {
    testId: 'tests/smoke.spec.ts > loads the page',
    file: 'tests/smoke.spec.ts',
    triggeredBy: [],
    failWhenTriggered: 0,
    failOtherwise: 0,
  },
];

/** Options for generating a history. */
export interface SyntheticOptions {
  /** How many runs to generate. */
  runs: number;
  /** Seed, so the same options always produce the same history. */
  seed?: number;
}

/** Generates a history file's worth of records, oldest first. */
export function syntheticHistory({ runs, seed = 1 }: SyntheticOptions): TestRecord[] {
  const random = mulberry32(seed);
  const records: TestRecord[] = [];
  const start = Date.parse('2026-01-01T00:00:00.000Z');

  for (let run = 0; run < runs; run += 1) {
    const changedFiles = pickChangedFiles(random);
    const runId = `run-${String(run).padStart(4, '0')}`;
    const commitSha = String(run).padStart(40, '0');
    const timestamp = new Date(start + run * 3_600_000).toISOString();

    for (const behaviour of BEHAVIOURS) {
      const triggered = behaviour.triggeredBy.some((file) => changedFiles.includes(file));
      const chance = triggered ? behaviour.failWhenTriggered : behaviour.failOtherwise;
      const failed = random() < chance;

      records.push({
        testId: behaviour.testId,
        file: behaviour.file,
        project: 'chromium',
        duration: 500 + Math.floor(random() * 1500),
        status: failed ? 'failed' : 'passed',
        timestamp,
        commitSha,
        changedFiles,
        branch: 'main',
        runId,
        retry: 0,
      });
    }
  }

  return records;
}

/** One or two source files per run, so co-change has something to separate. */
function pickChangedFiles(random: () => number): string[] {
  const first = SOURCE_FILES[Math.floor(random() * SOURCE_FILES.length)] as string;
  if (random() < 0.3) {
    const second = SOURCE_FILES[Math.floor(random() * SOURCE_FILES.length)] as string;
    if (second !== first) {
      return [first, second];
    }
  }
  return [first];
}

/** The tests the generator knows about, for assertions that need to name one. */
export const SYNTHETIC = {
  authTest: BEHAVIOURS[0] as TestBehaviour,
  cartTest: BEHAVIOURS[1] as TestBehaviour,
  innocentUiTest: BEHAVIOURS[2] as TestBehaviour,
  flakyTest: BEHAVIOURS[3] as TestBehaviour,
  sourceFiles: SOURCE_FILES,
};
