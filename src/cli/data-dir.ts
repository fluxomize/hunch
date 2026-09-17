import { resolve } from 'node:path';
import { HUNCH_DIR } from '../config.js';
import { getRepositoryRoot } from '../git/index.js';

/**
 * Deciding where Hunch's data lives.
 *
 * The reporter anchors `.hunch` at the top of the git working tree, because that is where the
 * paths it records are relative to and it must not move when somebody points `testDir`
 * elsewhere. The commands have to agree with it, or running `hunch train` from a subdirectory
 * of your own repository would look for a history that is one level up and report that you
 * have never collected any.
 *
 * An explicit `--dir` is still resolved against the working directory, because that is what
 * somebody typing a relative path at a prompt means by it.
 */
export function resolveDataDir(explicit?: string, repoRoot?: string): string {
  const cwd = process.cwd();
  if (explicit) {
    return resolve(cwd, explicit);
  }
  // getRepositoryRoot returns an empty string outside a repository, so fall back on falsiness
  // rather than on null, or `resolve('')` would quietly produce the wrong directory.
  return resolve(repoRoot || getRepositoryRoot({ cwd }) || cwd, HUNCH_DIR);
}
