import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveDataDir } from '../src/cli/data-dir.js';

/**
 * Canonicalises a path whose last segment need not exist.
 *
 * The same directory has several true names: the temp directory is a symlink on macOS and
 * arrives as an 8.3 short name on Windows, while git reports the long one. Only the parent can
 * be resolved here, because `.hunch` is a path being computed rather than a directory that has
 * been created.
 */
const normalise = (path: string): string =>
  join(realpathSync.native(dirname(path)), basename(path))
    .split('\\')
    .join('/');

describe('resolving where Hunch data lives', () => {
  let repo: string;
  let nested: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'hunch-datadir-'));
    nested = join(repo, 'packages', 'web');
    mkdirSync(nested, { recursive: true });
    execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(repo, { recursive: true, force: true });
  });

  it('defaults to .hunch at the top of the working tree', () => {
    process.chdir(repo);
    expect(normalise(resolveDataDir())).toBe(normalise(join(repo, '.hunch')));
  });

  it('finds the same directory from a subdirectory of the repository', () => {
    // The bug this function exists to prevent: the reporter writes to the repository root, so
    // running `hunch train` from a workspace package used to report an empty history.
    process.chdir(nested);
    expect(normalise(resolveDataDir())).toBe(normalise(join(repo, '.hunch')));
  });

  it('resolves an explicit --dir against the working directory', () => {
    // What somebody typing a relative path at a prompt means by it.
    process.chdir(nested);
    expect(resolveDataDir('local-data')).toBe(resolve(nested, 'local-data'));
  });

  it('accepts an absolute --dir unchanged', () => {
    process.chdir(repo);
    const absolute = join(repo, 'elsewhere');
    expect(resolveDataDir(absolute)).toBe(resolve(absolute));
  });

  it('prefers a repository root it is handed over looking one up', () => {
    process.chdir(nested);
    expect(resolveDataDir(undefined, repo)).toBe(resolve(repo, '.hunch'));
  });

  it('falls back to the working directory outside a repository', () => {
    const plain = mkdtempSync(join(tmpdir(), 'hunch-plain-'));
    try {
      process.chdir(plain);
      expect(normalise(resolveDataDir())).toBe(normalise(join(plain, '.hunch')));
    } finally {
      process.chdir(originalCwd);
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
