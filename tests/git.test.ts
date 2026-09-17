import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getBranch,
  getChangedFiles,
  getCommitSha,
  getRepositoryRoot,
  getUncommittedFiles,
  isGitRepository,
} from '../src/git/index.js';

/**
 * These tests drive a real, throwaway git repository rather than a mock, because the thing
 * worth verifying is how git actually behaves at the edges: a first commit with no parent, a
 * detached HEAD, an untracked file.
 */
describe('git helpers', () => {
  let repo: string;

  const run = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  };

  const commit = (file: string, contents: string, message: string): void => {
    writeFileSync(join(repo, file), contents);
    run('add', file);
    run('commit', '-m', message);
  };

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'hunch-git-'));
    run('init', '-b', 'main');
    run('config', 'user.email', 'test@example.com');
    run('config', 'user.name', 'Hunch Test');
    run('config', 'commit.gpgsign', 'false');
    commit('first.txt', 'one\n', 'first');
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('recognises a git working tree', () => {
    expect(isGitRepository({ cwd: repo })).toBe(true);
  });

  it('does not recognise a plain directory', () => {
    const plain = mkdtempSync(join(tmpdir(), 'hunch-plain-'));
    try {
      expect(isGitRepository({ cwd: plain })).toBe(false);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('reads the current commit sha', () => {
    expect(getCommitSha({ cwd: repo })).toMatch(/^[0-9a-f]{40}$/);
  });

  it('reads the current branch', () => {
    expect(getBranch({ cwd: repo })).toBe('main');
  });

  it('finds the top of the working tree from a subdirectory', () => {
    // Everything Hunch writes is anchored at this path, and Playwright may run git from a
    // nested testDir, so resolving it from below has to give the same answer.
    const nested = join(repo, 'deep', 'nested');
    mkdirSync(nested, { recursive: true });

    // Both sides are canonicalised before comparing, because the same directory has more than
    // one true name: the temp directory is a symlink on macOS, and on the Windows CI runner it
    // arrives as an 8.3 short name like RUNNER~1 while git reports the long one. Only
    // `realpathSync.native` expands a short name, and it resolves symlinks too.
    const normalise = (path: string): string => realpathSync.native(path).split('\\').join('/');
    const expected = normalise(repo);

    expect(normalise(getRepositoryRoot({ cwd: repo }))).toBe(expected);
    expect(normalise(getRepositoryRoot({ cwd: nested }))).toBe(expected);
  });

  it('falls back to the files of the commit when HEAD has no parent', () => {
    expect(getChangedFiles('HEAD~1..HEAD', { cwd: repo })).toEqual(['first.txt']);
  });

  it('lists the files changed between two commits', () => {
    commit('second.txt', 'two\n', 'second');
    expect(getChangedFiles('HEAD~1..HEAD', { cwd: repo })).toEqual(['second.txt']);
  });

  it('lists modified and untracked files in the working tree', () => {
    writeFileSync(join(repo, 'second.txt'), 'two, edited\n');
    writeFileSync(join(repo, 'third.txt'), 'three\n');
    expect(getUncommittedFiles({ cwd: repo }).sort()).toEqual(['second.txt', 'third.txt']);
  });

  it('returns empty values outside a repository instead of throwing', () => {
    const plain = mkdtempSync(join(tmpdir(), 'hunch-plain-'));
    try {
      expect(getCommitSha({ cwd: plain })).toBe('');
      expect(getBranch({ cwd: plain })).toBe('');
      expect(getRepositoryRoot({ cwd: plain })).toBe('');
      expect(getChangedFiles('HEAD~1..HEAD', { cwd: plain })).toEqual([]);
      expect(getUncommittedFiles({ cwd: plain })).toEqual([]);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
