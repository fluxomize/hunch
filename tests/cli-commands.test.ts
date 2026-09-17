import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { stats } from '../src/cli/stats.js';
import { train } from '../src/cli/train.js';
import { appendRecords } from '../src/storage/jsonl.js';
import { readModel } from '../src/storage/model.js';
import { CONFIG_FILE } from '../src/user-config.js';
import { syntheticHistory } from './support/synthetic.js';

/**
 * These drive the commands themselves rather than the argument parsing, inside a throwaway
 * repository. What is worth checking is that every refusal explains itself: somebody in their
 * first month with Hunch meets these messages far more often than they meet a trained model.
 */
describe('train and stats', () => {
  let repo: string;
  let dataDir: string;
  let out: MockInstance<typeof process.stdout.write>;
  let err: MockInstance<typeof process.stderr.write>;
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;

  const printed = (): string => out.mock.calls.map((call) => String(call[0])).join('');
  const warned = (): string => err.mock.calls.map((call) => String(call[0])).join('');

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'hunch-cmd-'));
    dataDir = join(repo, '.hunch');
    mkdirSync(dataDir, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
    process.chdir(repo);

    out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    out.mockRestore();
    err.mockRestore();
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    rmSync(repo, { recursive: true, force: true });
  });

  const giveHistory = (runs: number): void => {
    appendRecords(join(dataDir, 'history.jsonl'), syntheticHistory({ runs }));
  };

  describe('train', () => {
    it('says how to start when there is no history', async () => {
      await train({ minRuns: 20 });
      expect(warned()).toContain('No history at');
      expect(warned()).toContain('@fluxomize/hunch/reporter');
      expect(process.exitCode).toBe(1);
    });

    it('says how many more runs are needed', async () => {
      // The honest answer for most of somebody's first month.
      giveHistory(4);
      await train({ minRuns: 20 });
      expect(warned()).toContain('Only 4 run(s)');
      expect(warned()).toContain('at least 20');
      expect(process.exitCode).toBe(1);
    });

    it('trains and writes a model once there is enough', async () => {
      giveHistory(30);
      await train({ minRuns: 20 });

      expect(process.exitCode).toBe(originalExitCode);
      expect(readModel(join(dataDir, 'model.json'))).not.toBeNull();
    });

    it('reports quality and weights so the model can be argued with', async () => {
      giveHistory(30);
      await train({ minRuns: 20 });

      const report = printed();
      expect(report).toContain('precision');
      expect(report).toContain('recall');
      expect(report).toContain('Weights, largest influence first');
      expect(report).toContain('coChangeFailureRate');
    });

    it('takes the minimum run count from the config file', async () => {
      writeFileSync(join(repo, CONFIG_FILE), JSON.stringify({ minRunsToTrain: 3 }), 'utf8');
      giveHistory(4);
      await train({});

      expect(readModel(join(dataDir, 'model.json'))).not.toBeNull();
    });

    it('lets a flag beat the config file', async () => {
      writeFileSync(join(repo, CONFIG_FILE), JSON.stringify({ minRunsToTrain: 3 }), 'utf8');
      giveHistory(4);
      await train({ minRuns: 50 });

      expect(warned()).toContain('at least 50');
    });

    it('refuses a broken config file rather than quietly using defaults', async () => {
      writeFileSync(join(repo, CONFIG_FILE), '{ not json', 'utf8');
      giveHistory(30);
      await train({});

      expect(warned()).toContain('not valid JSON');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('stats', () => {
    it('says how to start when there is no history', async () => {
      await stats({ top: 5 });
      expect(warned()).toContain('No history at');
      expect(process.exitCode).toBe(1);
    });

    it('answers the question somebody waiting actually has', async () => {
      giveHistory(6);
      await stats({ top: 5 });

      const report = printed();
      expect(report).toContain('6 runs');
      expect(report).toContain('more run(s) before');
    });

    it('says when there is enough history to train', async () => {
      giveHistory(30);
      await stats({ top: 5 });
      expect(printed()).toContain('Enough history to train');
    });

    it('ranks the tests that fail most often', async () => {
      giveHistory(30);
      await stats({ top: 5 });

      const report = printed();
      expect(report).toContain('Fails most often');
      expect(report).toContain('tests/auth.spec.ts');
    });

    it('honours --top', async () => {
      giveHistory(30);
      await stats({ top: 1 });

      const failing = printed().split('Fails most often:')[1]?.split('\n\n')[0] ?? '';
      expect(failing.trim().split('\n')).toHaveLength(1);
    });

    it('says there is no model yet, rather than nothing', async () => {
      giveHistory(6);
      await stats({ top: 5 });
      expect(printed()).toContain('Model: none yet');
    });

    it('reports the model once one exists', async () => {
      giveHistory(30);
      await train({ minRuns: 20 });
      out.mockClear();

      await stats({ top: 5 });
      const report = printed();
      expect(report).toContain('Model: trained');
      expect(report).toContain('Strongest signals');
    });

    it('reports a damaged model instead of hiding it', async () => {
      // Silently ignoring it would make Hunch look like it was predicting when it was not.
      giveHistory(6);
      writeFileSync(join(dataDir, 'model.json'), 'not json', 'utf8');
      await stats({ top: 5 });

      expect(printed()).toContain('not valid JSON');
    });
  });
});
